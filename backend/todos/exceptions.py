"""One error shape for the whole API.

Every 4xx/5xx response is::

    {"error": {"code": "validation_error", "message": "...", "fields": {...}}}

``fields`` is present only for validation failures. The frontend has exactly one
place to read errors from, which is the point: an unexpected DRF shape leaking
through is how a client ends up rendering "undefined" to a user.

Note on ``Http404``: DRF's own handler rewrites a Django ``Http404`` into a
``NotFound`` in a *local* variable, so the exception this function receives is
still the Django one. Both are mapped here, and an unrecognised exception falls
back to its status code — never to ``server_error`` for a 4xx.
"""

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404 as DjangoHttp404
from rest_framework import exceptions as drf_exc
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

# DRF exception class -> stable, machine-readable code.
_CODE_BY_EXCEPTION: tuple[tuple[type[Exception], str], ...] = (
    (drf_exc.ParseError, "parse_error"),
    (drf_exc.AuthenticationFailed, "authentication_failed"),
    (drf_exc.NotAuthenticated, "not_authenticated"),
    (drf_exc.PermissionDenied, "permission_denied"),
    (drf_exc.NotFound, "not_found"),
    (drf_exc.MethodNotAllowed, "method_not_allowed"),
    (drf_exc.NotAcceptable, "not_acceptable"),
    (drf_exc.UnsupportedMediaType, "unsupported_media_type"),
    (drf_exc.Throttled, "throttled"),
    (DjangoHttp404, "not_found"),
    (DjangoPermissionDenied, "permission_denied"),
)

# Last resort: derive the code from the HTTP status rather than guessing.
_CODE_BY_STATUS: dict[int, str] = {
    400: "bad_request",
    401: "not_authenticated",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    406: "not_acceptable",
    409: "conflict",
    415: "unsupported_media_type",
    429: "throttled",
}


def error_body(code: str, message: str, fields: dict | None = None) -> dict[str, Any]:
    """Build the documented envelope.

    Exported so responses that never reach DRF's exception handler (the
    unmatched-URL 404) still return the same shape.
    """
    body: dict[str, Any] = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return {"error": body}


def _flatten(messages: Any) -> list[str]:
    """Flatten DRF's nested error data into a flat list of strings."""
    if isinstance(messages, dict):
        flattened: list[str] = []
        for value in messages.values():
            flattened.extend(_flatten(value))
        return flattened
    if isinstance(messages, (list, tuple)):
        flattened = []
        for value in messages:
            flattened.extend(_flatten(value))
        return flattened
    return [str(messages)]


def _code_for(exc: Exception, response: Response) -> str:
    for exception_class, code in _CODE_BY_EXCEPTION:
        if isinstance(exc, exception_class):
            return code
    # ValidationError is an APIException subclass, so it is checked before the
    # generic APIException fallback.
    if isinstance(exc, drf_exc.ValidationError):
        return "validation_error"
    if isinstance(exc, drf_exc.APIException):
        return getattr(exc, "default_code", "api_error")
    if response.status_code in _CODE_BY_STATUS:
        return _CODE_BY_STATUS[response.status_code]
    return "server_error"


def _fields_for(exc: Exception) -> dict[str, list[str]] | None:
    """Per-field messages, when the failure is field-specific."""
    if not isinstance(exc, drf_exc.ValidationError):
        return None
    detail = exc.detail
    if not isinstance(detail, dict):
        return None

    fields: dict[str, list[str]] = {}
    for field, messages in detail.items():
        # Field names pass through unchanged; the non-field bucket keeps the key
        # DRF already gives it ("non_field_errors"), so clients learn one name.
        fields[str(field)] = _flatten(messages)
    return fields or None


def _message_for(exc: Exception, response: Response, fields: dict | None) -> str:
    if fields:
        return "Validation failed."

    # Prefer DRF's own description of the failure ("No Todo matches the given
    # query.") over a generic string.
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        described = _flatten(data["detail"])
        if described and described[0].strip():
            return described[0]

    flattened = _flatten(getattr(exc, "detail", ""))
    if flattened and flattened[0].strip():
        return flattened[0]

    return "Request failed."


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Normalise DRF error responses into the documented envelope."""
    response = drf_exception_handler(exc, context)
    if response is None:
        # Not a DRF-handled exception: a genuine bug. Let Django produce the 500
        # and log the traceback rather than inventing an envelope here.
        return None

    fields = _fields_for(exc)
    body: dict[str, Any] = {
        "code": _code_for(exc, response),
        "message": _message_for(exc, response, fields),
    }
    if fields:
        body["fields"] = fields

    response.data = {"error": body}
    return response
