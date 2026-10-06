"""프론트엔드 파일을 안전하게 찾아 HTTP 정적 응답으로 표현합니다."""
from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import unquote

from .http_response import HttpResponse


class StaticView:
    """읽기 전용 frontend/ 자산 제공기. 경로 탈출과 비파일 경로를 거부합니다."""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.index = self.root / "index.html"

    def render(self, request_path: str) -> HttpResponse | None:
        try:
            decoded_path = unquote(request_path, errors="strict")
        except (UnicodeDecodeError, ValueError):
            return None
        relative = "index.html" if decoded_path in ("", "/") else decoded_path.lstrip("/")
        if "\x00" in relative or "\\" in relative:
            return None
        target = (self.root / relative).resolve()
        try:
            target.relative_to(self.root)
        except ValueError:
            return None
        if not target.is_file():
            return None
        try:
            body = target.read_bytes()
        except OSError:
            return None
        content_type, _encoding = mimetypes.guess_type(target.name)
        if not content_type:
            content_type = "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "application/json", "image/svg+xml"):
            content_type = f"{content_type}; charset=utf-8"
        return HttpResponse(
            200,
            content_type,
            body,
            {
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Referrer-Policy": "no-referrer",
            },
        )
