"""컨트롤러 결과를 HTTP 응답으로 표현합니다."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    content_type: str
    body: bytes = b""
    headers: Mapping[str, str] = field(default_factory=dict)


class JsonView:
    """일관된 JSON 응답과 오류 본문을 만듭니다."""

    @staticmethod
    def render(payload: Any, *, status: int = 200, headers: Mapping[str, str] | None = None) -> HttpResponse:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        response_headers = {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
        }
        response_headers.update(headers or {})
        return HttpResponse(status, "application/json; charset=utf-8", body, response_headers)

    @staticmethod
    def error(status: int, message: str) -> HttpResponse:
        return JsonView.render({"error": {"status": status, "message": message}}, status=status)


class TextView:
    """CSV 등의 다운로드 가능한 UTF-8 응답을 만듭니다."""

    @staticmethod
    def render(
        text: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
        status: int = 200,
        headers: Mapping[str, str] | None = None,
    ) -> HttpResponse:
        response_headers = {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
        }
        response_headers.update(headers or {})
        return HttpResponse(status, content_type, text.encode("utf-8"), response_headers)
