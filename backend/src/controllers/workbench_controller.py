"""plen MVC 컨트롤러: 입력 검증, CSV 미리보기, 카드 CRUD와 리추얼 업무 흐름."""
from __future__ import annotations

import time
import uuid
from typing import Any, Mapping

from ..models.ritual import (
    MAX_EXPERIENCES,
    MAX_RITUAL_RECORDS,
    RitualValidationError,
    calculate_stats,
    deduplicate_records,
    export_csv,
    map_csv_rows,
    normalize_date,
    parse_csv,
)
from ..models.workbench_store import StoreError, WorkbenchStore

MAX_ACTIVE_PREVIEWS = 3
PREVIEW_LIFETIME_SECONDS = 15 * 60


class ControllerError(Exception):
    """HTTP 상태 코드와 함께 전달할 사용자용 오류."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class WorkbenchController:
    """요청의 입력값을 확인하고 모델 저장소와 연결합니다."""

    def __init__(self, store: WorkbenchStore):
        self.store = store
        self._previews: dict[str, dict[str, Any]] = {}

    @staticmethod
    def health() -> dict[str, Any]:
        return {"ok": True, "service": "plen-python", "version": 1}

    def get_state(self) -> dict[str, Any]:
        return self.store.read()

    def list_experiences(self) -> dict[str, Any]:
        state = self.store.read()
        return {"experiences": state["experiences"], "count": len(state["experiences"])}

    def create_experience(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        self._require_mapping(payload)
        try:
            experience = self.store.add_experience(payload)
        except RitualValidationError as error:
            raise ControllerError(400, str(error)) from error
        except StoreError as error:
            raise ControllerError(409, str(error)) from error
        return {"experience": experience}

    def update_experience(self, experience_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        self._require_id(experience_id, "경험 카드 ID")
        self._require_mapping(payload)
        try:
            experience = self.store.update_experience(experience_id, payload)
        except RitualValidationError as error:
            raise ControllerError(400, str(error)) from error
        except StoreError as error:
            status = 404 if "찾을 수 없습니다" in str(error) else 409
            raise ControllerError(status, str(error)) from error
        return {"experience": experience}

    def delete_experience(self, experience_id: str) -> dict[str, Any]:
        self._require_id(experience_id, "경험 카드 ID")
        try:
            self.store.delete_experience(experience_id)
        except StoreError as error:
            status = 404 if "찾을 수 없습니다" in str(error) else 409
            raise ControllerError(status, str(error)) from error
        return {"deleted": True, "id": experience_id}

    def preview_ritual_csv(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        self._require_mapping(payload)
        csv_text = payload.get("csvText")
        if not isinstance(csv_text, str) or not csv_text.strip():
            raise ControllerError(400, "CSV 내용을 입력해 주세요.")
        slash_order = payload.get("slashOrder", "MDY")
        if slash_order not in ("MDY", "DMY"):
            raise ControllerError(400, "날짜 순서는 MDY 또는 DMY를 선택해 주세요.")

        try:
            parsed = parse_csv(csv_text)
            candidates = map_csv_rows(parsed, slash_order=slash_order)
        except RitualValidationError as error:
            raise ControllerError(400, str(error)) from error

        state = self.store.read()
        deduplicated = deduplicate_records(candidates, state["rituals"])
        now = time.monotonic()
        self._expire_previews(now)
        while len(self._previews) >= MAX_ACTIVE_PREVIEWS:
            oldest_id = next(iter(self._previews))
            del self._previews[oldest_id]

        preview_id = str(uuid.uuid4())
        preview_candidates = deduplicated["candidates"]
        self._previews[preview_id] = {"created": now, "candidates": preview_candidates}
        return {
            "previewId": preview_id,
            "candidates": preview_candidates,
            "candidateCount": len(preview_candidates),
            "duplicateInFileCount": deduplicated["duplicateInFileCount"],
            "duplicateExistingCount": deduplicated["duplicateExistingCount"],
            "expiresInSeconds": PREVIEW_LIFETIME_SECONDS,
        }

    def import_ritual_preview(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        self._require_mapping(payload)
        preview_id = payload.get("previewId")
        if not isinstance(preview_id, str) or not preview_id:
            raise ControllerError(400, "미리보기 ID를 확인해 주세요.")
        self._expire_previews(time.monotonic())
        preview = self._previews.get(preview_id)
        if preview is None:
            raise ControllerError(404, "미리보기가 만료되었거나 서버를 다시 시작했습니다. CSV를 다시 읽어 주세요.")

        selected_ids = payload.get("selectedIds")
        if not isinstance(selected_ids, list) or len(selected_ids) > MAX_RITUAL_RECORDS:
            raise ControllerError(400, "가져올 기록 ID 목록을 확인해 주세요.")
        if any(not isinstance(item, str) for item in selected_ids):
            raise ControllerError(400, "기록 ID는 문자열이어야 합니다.")
        if len(set(selected_ids)) != len(selected_ids):
            raise ControllerError(400, "같은 기록을 중복 선택했습니다.")

        candidates = preview["candidates"]
        candidate_by_id = {candidate["id"]: candidate for candidate in candidates}
        unknown_ids = [item for item in selected_ids if item not in candidate_by_id]
        if unknown_ids:
            raise ControllerError(400, "현재 CSV 미리보기에 없는 기록이 선택되었습니다.")

        date_overrides = payload.get("dateOverrides", {})
        if not isinstance(date_overrides, dict):
            raise ControllerError(400, "날짜 수정 정보는 객체여야 합니다.")
        if any(item not in candidate_by_id for item in date_overrides):
            raise ControllerError(400, "날짜를 수정하려는 행이 현재 미리보기에 없습니다.")

        selected_candidates: list[dict[str, Any]] = []
        for candidate_id in selected_ids:
            candidate = dict(candidate_by_id[candidate_id])
            if candidate_id in date_overrides:
                raw_date = date_overrides[candidate_id]
                if not isinstance(raw_date, str):
                    raise ControllerError(400, "수정 날짜는 YYYY-MM-DD 문자열이어야 합니다.")
                normalized = normalize_date(raw_date)
                if raw_date.strip() and not normalized:
                    raise ControllerError(400, f"{candidate.get('sourceRow', '?')}행의 날짜가 올바르지 않습니다.")
                candidate["date"] = normalized
                candidate["invalidDate"] = not bool(normalized)
            selected_candidates.append(candidate)

        current_state = self.store.read()
        deduplicated = deduplicate_records(selected_candidates, current_state["rituals"])
        eligible = [
            candidate for candidate in deduplicated["candidates"]
            if str(candidate.get("content", "")).strip()
            and not candidate.get("duplicateInFile")
            and not candidate.get("duplicateExisting")
        ]
        empty_count = sum(not str(candidate.get("content", "")).strip() for candidate in selected_candidates)
        duplicate_count = deduplicated["duplicateInFileCount"] + deduplicated["duplicateExistingCount"]

        try:
            result = self.store.import_rituals(eligible) if eligible else {"importedCount": 0, "duplicateCount": 0}
        except RitualValidationError as error:
            raise ControllerError(400, str(error)) from error
        except StoreError as error:
            raise ControllerError(409, str(error)) from error

        duplicate_count += result["duplicateCount"]
        self._previews.pop(preview_id, None)
        return {
            "importedCount": result["importedCount"],
            "duplicateCount": duplicate_count,
            "emptyCount": empty_count,
            "recordCount": len(self.store.read()["rituals"]),
        }

    def list_rituals(self, query: Mapping[str, list[str]]) -> dict[str, Any]:
        state = self.store.read()
        records = state["rituals"]
        type_filter = _first_query(query, "type", "all")
        if type_filter not in ("all", "아침", "마무리", "기타"):
            raise ControllerError(400, "리추얼 유형 필터를 확인해 주세요.")
        date_filter = _first_query(query, "date", "")
        if date_filter:
            normalized_filter = normalize_date(date_filter)
            if not normalized_filter:
                raise ControllerError(400, "날짜 필터는 YYYY-MM-DD 형식이어야 합니다.")
        else:
            normalized_filter = ""
        order = _first_query(query, "order", "desc")
        if order not in ("asc", "desc"):
            raise ControllerError(400, "정렬 순서는 asc 또는 desc여야 합니다.")

        filtered = [
            record for record in records
            if (type_filter == "all" or record["type"] == type_filter)
            and (not normalized_filter or record["date"] == normalized_filter)
        ]
        filtered.sort(key=lambda item: (item["date"] or "0000-00-00", item["type"], item["importedAt"]), reverse=order == "desc")
        return {
            "records": filtered,
            "count": len(filtered),
            "totalCount": len(records),
            "stats": calculate_stats(records),
        }

    def link_rituals_to_experience(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        self._require_mapping(payload)
        experience_id = payload.get("experienceId")
        self._require_id(experience_id, "경험 카드 ID")
        record_ids = payload.get("recordIds")
        if not isinstance(record_ids, list) or not record_ids or len(record_ids) > MAX_RITUAL_RECORDS:
            raise ControllerError(400, "연결할 리추얼 기록을 하나 이상 선택해 주세요.")
        if any(not isinstance(item, str) or not item for item in record_ids):
            raise ControllerError(400, "리추얼 기록 ID 목록을 확인해 주세요.")
        if len(set(record_ids)) != len(record_ids):
            raise ControllerError(400, "같은 리추얼 기록이 중복 선택되었습니다.")

        result = {"addedCount": 0, "alreadyLinkedCount": 0, "limitReachedCount": 0}
        def apply(document: dict[str, Any]) -> None:
            experience_ids = {item["id"] for item in document["experiences"]}
            if experience_id not in experience_ids:
                raise ControllerError(404, "연결할 경험 카드를 찾을 수 없습니다.")
            record_map = {item["id"]: item for item in document["rituals"]}
            if any(record_id not in record_map for record_id in record_ids):
                raise ControllerError(404, "선택한 리추얼 기록 중 찾을 수 없는 항목이 있습니다.")
            for record_id in record_ids:
                record = record_map[record_id]
                current = document["ritualLinks"].get(record_id, record.get("linkedTo", []))
                current = list(dict.fromkeys(item for item in current if isinstance(item, str)))
                if experience_id in current:
                    result["alreadyLinkedCount"] += 1
                elif len(current) >= 12:
                    result["limitReachedCount"] += 1
                else:
                    current.append(experience_id)
                    result["addedCount"] += 1
                record["linkedTo"] = current
                if current:
                    document["ritualLinks"][record_id] = current
                else:
                    document["ritualLinks"].pop(record_id, None)
        try:
            self.store.update(apply)
        except ControllerError:
            raise
        except StoreError as error:
            raise ControllerError(409, str(error)) from error
        return {"recordCount": len(record_ids), **result}

    def delete_all_rituals(self) -> dict[str, Any]:
        try:
            self.store.delete_all_rituals()
        except StoreError as error:
            raise ControllerError(409, str(error)) from error
        return {"deleted": True, "recordCount": 0}

    def export_ritual_csv(self, query: Mapping[str, list[str]]) -> str:
        result = self.list_rituals(query)
        state = self.store.read()
        names = {item["id"]: item["name"] for item in state["experiences"]}
        return export_csv(result["records"], names)

    def _expire_previews(self, now: float) -> None:
        expired = [
            preview_id for preview_id, value in self._previews.items()
            if now - value["created"] >= PREVIEW_LIFETIME_SECONDS
        ]
        for preview_id in expired:
            del self._previews[preview_id]

    @staticmethod
    def _require_mapping(value: Any) -> None:
        if not isinstance(value, Mapping):
            raise ControllerError(400, "요청 본문은 JSON 객체여야 합니다.")

    @staticmethod
    def _require_id(value: Any, label: str) -> None:
        if not isinstance(value, str) or not value or len(value) > 140:
            raise ControllerError(400, f"{label}를 확인해 주세요.")


def _first_query(query: Mapping[str, list[str]], key: str, default: str) -> str:
    values = query.get(key)
    if not values:
        return default
    return values[0]
