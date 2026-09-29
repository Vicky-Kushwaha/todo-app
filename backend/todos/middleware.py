"""Request logging middleware.

What gets logged: one line per request with an id, method, path, status and
duration. What deliberately does not: request bodies, titles, query strings or
any header — todo titles are user content and do not belong in logs. The
request id is echoed back on ``X-Request-ID`` so a client-visible failure can be
tied to a server log line without guessing.
"""

import logging
import time
import uuid

logger = logging.getLogger("todos.request")


class RequestLogMiddleware:
    """Attach a request id and emit a single structured log line per request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = uuid.uuid4().hex
        request.request_id = request_id
        started = time.monotonic()

        try:
            response = self.get_response(request)
        except Exception:
            # Let Django's own handler produce the 500, but leave a log line
            # that ties the traceback to the request id first.
            logger.exception(
                "request failed with unhandled exception",
                extra=self._extra(request, request_id, None, started),
            )
            raise

        status_code = getattr(response, "status_code", 0)
        logger.log(
            self._level_for(status_code),
            "request completed",
            extra=self._extra(request, request_id, status_code, started),
        )
        response["X-Request-ID"] = request_id
        return response

    @staticmethod
    def _extra(request, request_id: str, status_code: int | None, started: float) -> dict:
        return {
            "request_id": request_id,
            "method": request.method,
            # path only, on purpose: the query string could carry user input.
            "path": request.path,
            "status_code": status_code if status_code is not None else "-",
            "duration_ms": round((time.monotonic() - started) * 1000, 2),
        }

    @staticmethod
    def _level_for(status_code: int) -> int:
        if status_code >= 500:
            return logging.ERROR
        if status_code >= 400:
            return logging.WARNING
        return logging.INFO
