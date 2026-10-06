"""버전 1 localStorage 문서와 호환되는 검증형 파일 저장소.

브라우저 앱은 기존처럼 localStorage를 사용합니다. Python API/CLI에서 쓰는 선택적
저장소로, 여러 번의 갱신은 한 JSON 문서를 원자적으로 교체합니다. 서버 모드의 경우
PLEN_DATA_FILE 환경 변수로 경로를 지정하지 않으면 파일 저장을 거부합니다.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Mapping

from .ritual import (
    MAX_EXPERIENCES,
    MAX_RITUAL_RECORDS,
    ExperienceCard,
    RitualRecord,
    RitualValidationError,
    _text,
    normalize_type,
)

MAX_DOCUMENT_CHARACTERS = 1_500_000
MAX_APPLICATIONS = 20
VALID_STATUSES = {"작성 중", "제출 완료", "면접 진행", "마감"}


class StoreError(RuntimeError):
    """저장소 읽기·쓰기 오류."""


class WorkbenchStore:
    """기존 plen-workbench-v1의 상위 JSON 키를 보존하는 JSON 파일 저장소."""

    def __init__(self, path: str | Path):
        self.path = Path(path).expanduser()
        self._lock = threading.RLock()

    @classmethod
    def from_environment(cls) -> "WorkbenchStore":
        configured = os.environ.get("PLEN_DATA_FILE", "").strip()
        if not configured:
            raise StoreError("파일 저장소를 쓰려면 PLEN_DATA_FILE 환경 변수로 저장 경로를 지정해야 합니다.")
        return cls(configured)

    def _empty(self) -> dict[str, Any]:
        return {"version": 1, "applications": [], "experiences": [], "rituals": [], "ritualLinks": {}}

    def read(self) -> dict[str, Any]:
        with self._lock:
            if not self.path.exists():
                return self._empty()
            try:
                raw = self.path.read_text(encoding="utf-8")
                if len(raw) > MAX_DOCUMENT_CHARACTERS:
                    raise StoreError("저장 문서가 허용 크기 1.5MB를 초과했습니다.")
                document = json.loads(raw)
            except StoreError:
                raise
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                raise StoreError("저장 문서를 읽을 수 없습니다. JSON 파일 형식을 확인해 주세요.") from error
            if not isinstance(document, dict) or document.get("version") != 1:
                raise StoreError("지원하지 않는 저장 문서입니다. version 1 문서를 사용해 주세요.")
            return self._normalize_document(document)

    def _normalize_document(self, document: Mapping[str, Any]) -> dict[str, Any]:
        applications_source = document.get("applications", [])
        experiences_source = document.get("experiences", [])
        rituals_source = document.get("rituals", [])
        links_source = document.get("ritualLinks", {})
        if not isinstance(applications_source, list) or not isinstance(experiences_source, list) or not isinstance(rituals_source, list):
            raise StoreError("지원 건·경험 카드·리추얼 기록은 목록이어야 합니다.")
        if not isinstance(links_source, dict):
            raise StoreError("리추얼 연결 정보는 객체여야 합니다.")

        applications: list[dict[str, Any]] = []
        for source in applications_source[:MAX_APPLICATIONS]:
            if not isinstance(source, dict):
                continue
            status = source.get("status", "작성 중")
            deadline = source.get("deadline", "")
            if deadline and not _valid_iso_date(deadline):
                deadline = ""
            applications.append({
                "id": _bounded_string(source.get("id"), 100) or "",
                "company": _bounded_string(source.get("company"), 80),
                "role": _bounded_string(source.get("role"), 80),
                "job": _bounded_string(source.get("job"), 12_000),
                "context": _bounded_string(source.get("context"), 2_400),
                "actions": _bounded_string(source.get("actions"), 3_000),
                "outcome": _bounded_string(source.get("outcome"), 2_400),
                "status": status if status in VALID_STATUSES else "작성 중",
                "deadline": deadline,
                "updatedAt": _iso_datetime(source.get("updatedAt")),
            })

        experiences: list[dict[str, Any]] = []
        seen_experience_ids: set[str] = set()
        for source in experiences_source[:MAX_EXPERIENCES]:
            if not isinstance(source, dict):
                continue
            try:
                experience = ExperienceCard.from_mapping(source)
            except RitualValidationError:
                continue
            if experience.id in seen_experience_ids:
                continue
            seen_experience_ids.add(experience.id)
            experiences.append(experience.to_dict())

        rituals: list[dict[str, Any]] = []
        seen_ritual_ids: set[str] = set()
        for source in rituals_source[:MAX_RITUAL_RECORDS]:
            if not isinstance(source, dict):
                continue
            record = RitualRecord.from_mapping(source)
            if record.id in seen_ritual_ids:
                continue
            seen_ritual_ids.add(record.id)
            rituals.append(record.to_dict())

        experience_ids = {item["id"] for item in experiences}
        ritual_ids = {item["id"] for item in rituals}
        ritual_links: dict[str, list[str]] = {}
        for record_id, linked_ids in list(links_source.items())[:MAX_RITUAL_RECORDS]:
            if not isinstance(record_id, str) or record_id not in ritual_ids or not isinstance(linked_ids, list):
                continue
            cleaned: list[str] = []
            for experience_id in linked_ids:
                if isinstance(experience_id, str) and experience_id in experience_ids and experience_id not in cleaned:
                    cleaned.append(experience_id)
                if len(cleaned) >= 12:
                    break
            if cleaned:
                ritual_links[record_id] = cleaned
        for record in rituals:
            if record["id"] in ritual_links:
                record["linkedTo"] = ritual_links[record["id"]]
            else:
                safe_links = [item_id for item_id in record["linkedTo"] if item_id in experience_ids][:12]
                record["linkedTo"] = safe_links
                if safe_links:
                    ritual_links[record["id"]] = safe_links

        # 이력서 등 아직 Python API에서 관리하지 않는 데이터는 손대지 않습니다.
        preserved = {
            key: value for key, value in document.items()
            if key not in {"version", "applications", "experiences", "rituals", "ritualLinks"}
        }
        return {
            **preserved,
            "version": 1,
            "applications": applications,
            "experiences": experiences,
            "rituals": rituals,
            "ritualLinks": ritual_links,
        }

    def update(self, mutator: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
        with self._lock:
            document = self.read()
            mutator(document)
            normalized = self._normalize_document(document)
            serialized = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
            if len(serialized) > MAX_DOCUMENT_CHARACTERS:
                raise StoreError("저장 공간 한도를 초과했습니다. 오래된 자료를 정리해 주세요.")
            self._write_atomically(serialized)
            return normalized

    def _write_atomically(self, serialized: str) -> None:
        parent = self.path.parent
        try:
            parent.mkdir(parents=True, exist_ok=True)
            file_descriptor, temporary_name = tempfile.mkstemp(prefix=f".{self.path.name}.", suffix=".tmp", dir=parent)
            try:
                with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="\n") as temporary_file:
                    temporary_file.write(serialized)
                    temporary_file.flush()
                    os.fsync(temporary_file.fileno())
                os.replace(temporary_name, self.path)
            except Exception:
                try:
                    os.unlink(temporary_name)
                except OSError:
                    pass
                raise
        except OSError as error:
            raise StoreError("저장 파일을 기록할 수 없습니다. 경로와 쓰기 권한을 확인해 주세요.") from error

    def add_experience(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        experience = ExperienceCard.from_mapping(payload, preserve_id=False)
        def apply(document: dict[str, Any]) -> None:
            if len(document["experiences"]) >= MAX_EXPERIENCES:
                raise StoreError(f"경험 카드는 최대 {MAX_EXPERIENCES}개까지 등록할 수 있습니다.")
            document["experiences"].insert(0, experience.to_dict())
        document = self.update(apply)
        return next(item for item in document["experiences"] if item["id"] == experience.id)

    def update_experience(self, experience_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        experience = ExperienceCard.from_mapping({**dict(payload), "id": experience_id})
        found = False
        def apply(document: dict[str, Any]) -> None:
            nonlocal found
            updated = []
            for item in document["experiences"]:
                if item["id"] == experience_id:
                    updated.append(experience.to_dict())
                    found = True
                else:
                    updated.append(item)
            if not found:
                raise StoreError("수정할 경험 카드를 찾을 수 없습니다.")
            document["experiences"] = updated
        document = self.update(apply)
        return next(item for item in document["experiences"] if item["id"] == experience_id)

    def delete_experience(self, experience_id: str) -> None:
        def apply(document: dict[str, Any]) -> None:
            original_count = len(document["experiences"])
            document["experiences"] = [item for item in document["experiences"] if item["id"] != experience_id]
            if len(document["experiences"]) == original_count:
                raise StoreError("삭제할 경험 카드를 찾을 수 없습니다.")
            for ritual in document["rituals"]:
                ritual["linkedTo"] = [item_id for item_id in ritual.get("linkedTo", []) if item_id != experience_id]
            for ritual_id in list(document["ritualLinks"]):
                remaining = [item_id for item_id in document["ritualLinks"][ritual_id] if item_id != experience_id]
                if remaining:
                    document["ritualLinks"][ritual_id] = remaining
                else:
                    del document["ritualLinks"][ritual_id]
        self.update(apply)

    def import_rituals(self, candidates: list[Mapping[str, Any]]) -> dict[str, Any]:
        prepared = [RitualRecord.from_mapping({**dict(candidate), "id": ""}, preserve_id=False) for candidate in candidates]
        result: dict[str, Any] = {"importedCount": 0, "duplicateCount": 0}
        def apply(document: dict[str, Any]) -> None:
            if len(document["rituals"]) + len(prepared) > MAX_RITUAL_RECORDS:
                raise StoreError(f"리추얼 기록은 최대 {MAX_RITUAL_RECORDS:,}건까지 보관할 수 있습니다.")
            known = {self._fingerprint_dict(item) for item in document["rituals"] if item.get("content", "").strip()}
            accepted = []
            duplicates = 0
            for record in prepared:
                item = record.to_dict()
                key = self._fingerprint_dict(item)
                if not item["content"].strip() or key in known:
                    duplicates += 1
                    continue
                known.add(key)
                accepted.append(item)
            document["rituals"].extend(accepted)
            result["importedCount"] = len(accepted)
            result["duplicateCount"] = duplicates
        self.update(apply)
        return result

    @staticmethod
    def _fingerprint_dict(record: Mapping[str, Any]) -> str:
        from .ritual import fingerprint_record
        return fingerprint_record(record)

    def delete_all_rituals(self) -> None:
        def apply(document: dict[str, Any]) -> None:
            document["rituals"] = []
            document["ritualLinks"] = {}
        self.update(apply)


def _bounded_string(value: Any, limit: int) -> str:
    return value[:limit] if isinstance(value, str) else ""


def _iso_datetime(value: Any) -> str:
    from datetime import datetime
    if isinstance(value, str):
        try:
            datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
            return value
        except ValueError:
            pass
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _valid_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 10:
        return False
    try:
        from datetime import date
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False
