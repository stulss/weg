"""리추얼 CSV 변환과 경험·리추얼 도메인 모델(표준 라이브러리만 사용)."""
from __future__ import annotations

import csv
import io
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterable, Mapping, Sequence

MAX_CSV_CHARACTERS = 5_000_000
MAX_CSV_ROWS = 10_000
MAX_FIELD_CHARACTERS = 100_000
MAX_PROMPT_CHARACTERS = 5_000
MAX_EXPERIENCES = 12
MAX_RITUAL_RECORDS = 2_000
MAX_LINKS_PER_RECORD = 12


class RitualValidationError(ValueError):
    """CSV 또는 경험·리추얼 입력이 유효하지 않을 때 발생합니다."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _text(value: Any, limit: int, *, trim: bool = False) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise RitualValidationError("문자열 입력을 확인해 주세요.")
    result = value.replace("\x00", "")[:limit]
    return result.strip() if trim else result


def _first_value(source: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def normalize_date(value: Any, *, slash_order: str = "MDY") -> str:
    """날짜를 YYYY-MM-DD로 정규화합니다. 해석할 수 없으면 빈 문자열을 반환합니다."""
    if value is None or isinstance(value, bool):
        return ""
    raw = str(value).strip().lstrip("\ufeff")
    if not raw:
        return ""

    def make_date(year_value: Any, month_value: Any, day_value: Any) -> str:
        try:
            year, month, day = int(year_value), int(month_value), int(day_value)
            if 0 <= year < 100:
                year += 2000 if year < 70 else 1900
            if not 1900 <= year <= 2100:
                return ""
            return date(year, month, day).isoformat()
        except (TypeError, ValueError, OverflowError):
            return ""

    match = re.match(r"^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s|$|T)", raw, re.IGNORECASE)
    if match:
        return make_date(*match.groups())

    match = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", raw)
    if match:
        return make_date(*match.groups())

    match = re.match(r"^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?", raw)
    if match:
        return make_date(*match.groups())

    match = re.match(r"^(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{4})\s*년?", raw)
    if match:
        return make_date(match.group(3), match.group(1), match.group(2))

    match = re.match(r"^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})(?:\s|$)", raw)
    if match:
        first, second = int(match.group(1)), int(match.group(2))
        order = str(slash_order or "MDY").upper()
        if first > 12 and second <= 12:
            order = "DMY"
        elif second > 12 and first <= 12:
            order = "MDY"
        if order == "DMY":
            return make_date(match.group(3), second, first)
        return make_date(match.group(3), first, second)

    # Excel 날짜 일련번호(1899-12-30 기준).
    if re.fullmatch(r"\d{5}(?:\.\d+)?", raw):
        try:
            serial = float(raw)
            if 20_000 <= serial <= 80_000:
                from datetime import timedelta
                return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()
        except (ValueError, OverflowError):
            return ""

    # Unix 초/밀리초 타임스탬프.
    if re.fullmatch(r"\d{10}|\d{13}", raw):
        try:
            numeric = int(raw)
            instant = datetime.fromtimestamp(numeric if len(raw) == 10 else numeric / 1000, tz=timezone.utc)
            return instant.date().isoformat()
        except (ValueError, OverflowError, OSError):
            return ""

    # ISO 날짜·시간과 시간대가 포함된 값.
    try:
        iso_value = raw[:-1] + "+00:00" if raw.endswith(("Z", "z")) else raw
        parsed = datetime.fromisoformat(iso_value)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc)
        return parsed.date().isoformat()
    except (ValueError, OverflowError):
        pass

    # RFC 형식 날짜 등 흔한 텍스트 표현.
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc)
        return parsed.date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return ""


def normalize_type(value: Any) -> str:
    raw = re.sub(r"\s+", " ", str(value or "").strip())
    normalized = raw.casefold()
    if re.search(r"아침|오전|morning|check[\s-]?in|start[\s-]?of[\s-]?day", normalized):
        return "아침"
    if re.search(r"마무리|저녁|오후|evening|closing|end[\s-]?of[\s-]?day|wrap[\s-]?up", normalized):
        return "마무리"
    return raw[:40] or "기타"


def canonical_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def _normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_items = re.split(r"[,，;；\n]+", value)
    elif isinstance(value, (list, tuple)):
        raw_items = value
    elif value is None:
        raw_items = []
    else:
        raise RitualValidationError("관련 키워드는 문자열 또는 목록이어야 합니다.")

    keywords: list[str] = []
    for item in raw_items:
        if not isinstance(item, str):
            continue
        keyword = re.sub(r"\s+", " ", item.strip())[:32]
        if keyword and keyword not in keywords:
            keywords.append(keyword)
        if len(keywords) >= 8:
            break
    return keywords


@dataclass(slots=True)
class ExperienceCard:
    id: str
    name: str
    period: str = ""
    context: str = ""
    actions: str = ""
    outcome: str = ""
    keywords: list[str] = field(default_factory=list)
    updated_at: str = field(default_factory=_now_iso)

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], *, preserve_id: bool = True) -> "ExperienceCard":
        if not isinstance(value, Mapping):
            raise RitualValidationError("경험 카드 형식을 확인해 주세요.")
        name = _text(_first_value(value, "name", "title"), 60, trim=True)
        context = _text(_first_value(value, "context", "situation"), 2_400)
        actions = _text(_first_value(value, "actions", "action"), 3_000)
        outcome = _text(_first_value(value, "outcome", "result"), 2_400)
        period = _text(value.get("period"), 100, trim=True)
        if not name:
            raise RitualValidationError("경험 카드 이름을 입력해 주세요.")
        if not any(part.strip() for part in (context, actions, outcome)):
            raise RitualValidationError("상황·행동·결과 중 실제 경험 내용을 하나 이상 입력해 주세요.")

        raw_id = value.get("id") if preserve_id else None
        card_id = raw_id if isinstance(raw_id, str) and 0 < len(raw_id) <= 100 else str(uuid.uuid4())
        updated_at = value.get("updatedAt", value.get("updated_at"))
        if not isinstance(updated_at, str) or not _is_iso_datetime(updated_at):
            updated_at = _now_iso()
        return cls(
            id=card_id,
            name=name,
            period=period,
            context=context,
            actions=actions,
            outcome=outcome,
            keywords=_normalize_keywords(_first_value(value, "keywords", "tags")),
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "period": self.period,
            "context": self.context,
            "actions": self.actions,
            "outcome": self.outcome,
            "keywords": list(self.keywords),
            "updatedAt": self.updated_at,
        }


@dataclass(slots=True)
class RitualRecord:
    id: str
    date: str
    type: str
    prompt: str
    content: str
    linked_to: list[str] = field(default_factory=list)
    imported_at: str = field(default_factory=_now_iso)

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], *, preserve_id: bool = True) -> "RitualRecord":
        if not isinstance(value, Mapping):
            raise RitualValidationError("리추얼 기록 형식을 확인해 주세요.")
        raw_id = value.get("id") if preserve_id else None
        record_id = raw_id if isinstance(raw_id, str) and 0 < len(raw_id) <= 140 else str(uuid.uuid4())
        raw_date = value.get("date", "")
        date_value = normalize_date(raw_date)
        prompt = _text(value.get("prompt"), MAX_PROMPT_CHARACTERS)
        content = _text(value.get("content"), MAX_FIELD_CHARACTERS)
        raw_links = value.get("linkedTo", value.get("linked_to", []))
        linked_to: list[str] = []
        if isinstance(raw_links, (list, tuple)):
            for linked_id in raw_links:
                if isinstance(linked_id, str) and 0 < len(linked_id) <= 120 and linked_id not in linked_to:
                    linked_to.append(linked_id)
                if len(linked_to) >= MAX_LINKS_PER_RECORD:
                    break
        imported_at = value.get("importedAt", value.get("imported_at"))
        if not isinstance(imported_at, str) or not _is_iso_datetime(imported_at):
            imported_at = _now_iso()
        return cls(
            id=record_id,
            date=date_value,
            type=normalize_type(value.get("type")),
            prompt=prompt[:MAX_PROMPT_CHARACTERS],
            content=content,
            linked_to=linked_to,
            imported_at=imported_at,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "date": self.date,
            "type": self.type,
            "prompt": self.prompt,
            "content": self.content,
            "linkedTo": list(self.linked_to),
            "importedAt": self.imported_at,
        }


def _is_iso_datetime(value: str) -> bool:
    try:
        datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
        return True
    except (ValueError, OverflowError):
        return False


def detect_delimiter(text: str) -> str:
    candidates = [",", ";", "\t", "|"]
    counts = dict.fromkeys(candidates, 0)
    quoted = False
    field_started = False
    index = 0
    while index < len(text):
        character = text[index]
        if character == '"':
            if quoted and index + 1 < len(text) and text[index + 1] == '"':
                index += 1
            elif quoted:
                quoted = False
            elif not field_started:
                quoted = True
                field_started = True
        elif not quoted and character in counts:
            counts[character] += 1
            field_started = False
        elif not quoted and character in "\r\n":
            break
        elif not character.isspace():
            field_started = True
        index += 1
    # 동률이면 후보 순서에 따라 쉼표를 우선합니다.
    return max(candidates, key=lambda item: counts[item])


def parse_csv(input_text: str) -> dict[str, Any]:
    if not isinstance(input_text, str):
        raise RitualValidationError("CSV 내용을 문자열로 읽지 못했습니다.")
    text = input_text.lstrip("\ufeff")
    if len(text) > MAX_CSV_CHARACTERS or len(text.encode("utf-8")) > MAX_CSV_CHARACTERS:
        raise RitualValidationError("CSV 파일은 5MB 이하만 읽을 수 있습니다.")

    delimiter = detect_delimiter(text)
    parsed_rows: list[list[str]] = []
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        for source_row in reader:
            row = [cell.replace("\r\n", "\n").replace("\r", "\n").strip() for cell in source_row]
            if any(cell.strip() for cell in row):
                if any(len(cell) > MAX_FIELD_CHARACTERS for cell in row):
                    raise RitualValidationError("CSV의 셀 하나가 허용된 최대 길이를 초과했습니다.")
                parsed_rows.append(row)
                if len(parsed_rows) > MAX_CSV_ROWS + 1:
                    raise RitualValidationError(f"CSV는 머리글을 포함해 최대 {MAX_CSV_ROWS:,}개 기록 행까지 처리할 수 있습니다.")
    except csv.Error as error:
        raise RitualValidationError("CSV 따옴표나 행 구분을 읽지 못했습니다. 원본 파일 형식을 확인해 주세요.") from error

    if len(parsed_rows) < 2:
        raise RitualValidationError("머리글과 기록 행이 있는 CSV를 선택해 주세요.")

    source_headers = parsed_rows[0]
    column_count = max([len(source_headers), *(len(row) for row in parsed_rows[1:])])
    headers = [
        source_headers[index].strip() if index < len(source_headers) and source_headers[index].strip() else f"열 {index + 1}"
        for index in range(column_count)
    ]
    rows = [
        [row[index].strip() if index < len(row) else "" for index in range(column_count)]
        for row in parsed_rows[1:]
    ]
    return {"headers": headers, "rows": rows, "delimiter": delimiter}


def _normalize_header(value: Any) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[\s_.:/\\\-()[\]{}]+", "", normalized)


def _find_column_index(headers: Sequence[str], aliases: Sequence[str]) -> int:
    normalized_aliases = [_normalize_header(alias) for alias in aliases]
    for index, header in enumerate(headers):
        normalized = _normalize_header(header)
        if any(normalized == alias or (len(alias) >= 4 and alias in normalized) for alias in normalized_aliases):
            return index
    return -1


def map_csv_rows(parsed: Mapping[str, Any], *, slash_order: str = "MDY") -> list[dict[str, Any]]:
    if not isinstance(parsed, Mapping) or not isinstance(parsed.get("headers"), list) or not isinstance(parsed.get("rows"), list):
        raise RitualValidationError("CSV 머리글과 행을 확인할 수 없습니다.")
    headers = [str(header or "") for header in parsed["headers"]]
    indexes = {
        "date": _find_column_index(headers, ["date", "날짜", "일자", "created at", "작성일", "기록일", "timestamp", "submitted at", "제출일", "datetime", "날짜시간"]),
        "type": _find_column_index(headers, ["ritual type", "ritual", "form name", "type", "리추얼 유형", "리추얼", "유형", "종류", "카테고리", "category"]),
        "prompt": _find_column_index(headers, ["prompt", "question", "질문", "문항", "item", "question text", "질문 내용"]),
        "content": _find_column_index(headers, ["answer", "response", "content", "내용", "답변", "기록", "회고", "응답", "value", "reflection"]),
        "participant": _find_column_index(headers, ["participant", "user email", "email", "username", "작성자", "참여자", "이름", "사용자", "사용자 이름"]),
    }
    metadata_indexes = {index for index in indexes.values() if index >= 0}
    participant_aliases: dict[str, str] = {}
    candidates: list[dict[str, Any]] = []

    def value_at(row: Sequence[str], index: int, limit: int = MAX_FIELD_CHARACTERS) -> str:
        return row[index][:limit] if 0 <= index < len(row) else ""

    for row_number, source_row in enumerate(parsed["rows"], start=2):
        row = [str(cell or "") for cell in source_row] if isinstance(source_row, (list, tuple)) else []
        raw_date = value_at(row, indexes["date"])
        date_value = normalize_date(raw_date, slash_order=slash_order)
        prompt = value_at(row, indexes["prompt"], MAX_PROMPT_CHARACTERS)
        content = value_at(row, indexes["content"])

        if not content.strip():
            parts = []
            for column_index, header in enumerate(headers):
                if column_index in metadata_indexes or column_index >= len(row):
                    continue
                cell = row[column_index].strip()
                if cell:
                    safe_header = header[:120] or f"열 {column_index + 1}"
                    parts.append(f"{safe_header}: {cell}")
            content = "\n".join(parts)[:MAX_FIELD_CHARACTERS]

        raw_type = value_at(row, indexes["type"])
        if raw_type:
            ritual_type = normalize_type(raw_type)
        else:
            type_source = " ".join([prompt, *row])
            if re.search(r"아침|오전|morning|check[\s-]?in", type_source, re.IGNORECASE):
                ritual_type = "아침"
            elif re.search(r"마무리|저녁|오후|closing|evening|wrap[\s-]?up", type_source, re.IGNORECASE):
                ritual_type = "마무리"
            else:
                ritual_type = "기타"

        raw_participant = value_at(row, indexes["participant"], 500).strip()
        participant = ""
        if raw_participant:
            key = canonical_text(raw_participant)
            if key not in participant_aliases:
                participant_aliases[key] = f"참여자 {len(participant_aliases) + 1}"
            participant = participant_aliases[key]

        has_content = bool(content.strip())
        invalid_date = not bool(date_value)
        candidates.append({
            "id": f"preview-{row_number - 1}",
            "date": date_value,
            "type": ritual_type,
            "prompt": prompt,
            "content": content,
            "participant": participant,
            "sourceRow": row_number,
            "invalidDate": invalid_date,
            "selected": has_content,
            "duplicateInFile": False,
            "duplicateExisting": False,
            "warning": "응답 내용이 비어 있음" if not has_content else ("날짜를 확인하거나 미리보기에서 입력해 주세요" if invalid_date else ""),
        })
    return candidates


def fingerprint_record(record: Mapping[str, Any] | RitualRecord) -> str:
    if isinstance(record, RitualRecord):
        values = (record.date, record.type, record.prompt, record.content)
    else:
        values = (record.get("date"), record.get("type"), record.get("prompt"), record.get("content"))
    return "\x1f".join(canonical_text(item) for item in values)


def deduplicate_records(
    candidates: Iterable[Mapping[str, Any]],
    existing_records: Iterable[Mapping[str, Any] | RitualRecord] = (),
) -> dict[str, Any]:
    existing = {
        fingerprint_record(record)
        for record in existing_records
        if str(record.content if isinstance(record, RitualRecord) else record.get("content", "")).strip()
    }
    seen_in_file: set[str] = set()
    duplicate_in_file_count = 0
    duplicate_existing_count = 0
    normalized: list[dict[str, Any]] = []

    for source in candidates:
        record = dict(source)
        has_content = bool(str(record.get("content", "")).strip())
        fingerprint = fingerprint_record(record)
        duplicate_in_file = has_content and fingerprint in seen_in_file
        if has_content and not duplicate_in_file:
            seen_in_file.add(fingerprint)
        duplicate_existing = has_content and fingerprint in existing
        duplicate_in_file_count += int(duplicate_in_file)
        duplicate_existing_count += int(duplicate_existing)

        if duplicate_in_file:
            warning = "CSV 안에서 중복된 기록"
        elif duplicate_existing:
            warning = "이미 보관된 기록과 동일한 내용"
        elif not has_content:
            warning = "응답 내용이 비어 있음"
        else:
            warning = str(record.get("warning", ""))
        record.update({
            "duplicateInFile": duplicate_in_file,
            "duplicateExisting": duplicate_existing,
            "selected": bool(record.get("selected")) and not duplicate_in_file and not duplicate_existing and has_content,
            "warning": warning,
        })
        normalized.append(record)

    return {
        "candidates": normalized,
        "duplicateInFileCount": duplicate_in_file_count,
        "duplicateExistingCount": duplicate_existing_count,
    }


def _day_number(value: Any) -> int | None:
    normalized = normalize_date(value)
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized).toordinal()
    except ValueError:
        return None


def _consecutive_run(dates: Iterable[Any], *, from_latest: bool = False) -> int:
    numbers = sorted({number for number in (_day_number(item) for item in dates) if number is not None})
    if not numbers:
        return 0
    if from_latest:
        run = 1
        for index in range(len(numbers) - 1, 0, -1):
            if numbers[index] - numbers[index - 1] != 1:
                break
            run += 1
        return run
    longest = current = 1
    for previous, current_day in zip(numbers, numbers[1:]):
        current = current + 1 if current_day == previous + 1 else 1
        longest = max(longest, current)
    return longest


def calculate_stats(records: Iterable[Mapping[str, Any] | RitualRecord]) -> dict[str, Any]:
    entries = list(records)
    dated_records: list[tuple[str, str]] = []
    for record in entries:
        if isinstance(record, RitualRecord):
            raw_date, raw_type = record.date, record.type
        else:
            raw_date, raw_type = record.get("date", ""), record.get("type", "")
        normalized = normalize_date(raw_date)
        if normalized:
            dated_records.append((normalized, normalize_type(raw_type)))

    all_dates = sorted({day for day, _kind in dated_records})
    morning_dates = {day for day, kind in dated_records if kind == "아침"}
    closing_dates = {day for day, kind in dated_records if kind == "마무리"}
    return {
        "recordCount": len(entries),
        "activeDays": len(all_dates),
        "morningDays": len(morning_dates),
        "closingDays": len(closing_dates),
        "longestStreak": _consecutive_run(all_dates),
        "recentStreak": _consecutive_run(all_dates, from_latest=True),
        "earliestDate": all_dates[0] if all_dates else "",
        "latestDate": all_dates[-1] if all_dates else "",
    }


def export_csv(
    records: Iterable[Mapping[str, Any] | RitualRecord],
    experience_names: Mapping[str, str] | None = None,
) -> str:
    names = experience_names or {}
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["날짜", "리추얼 유형", "문항", "기록", "연결 경험 카드"])
    for record in records:
        if isinstance(record, RitualRecord):
            item = record.to_dict()
        else:
            item = dict(record)
        linked_ids = item.get("linkedTo", item.get("linked_to", []))
        linked_names = [names[item_id] for item_id in linked_ids if item_id in names] if isinstance(linked_ids, (list, tuple)) else []
        writer.writerow([
            item.get("date", ""), item.get("type", ""), item.get("prompt", ""),
            item.get("content", ""), " | ".join(linked_names),
        ])
    return "\ufeff" + output.getvalue()
