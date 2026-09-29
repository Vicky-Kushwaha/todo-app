"""Logging helpers.

The request logger emits one line per request with a stable, greppable set of
fields. Any field a particular log record does not set falls back to a default
so the formatter never raises mid-request.
"""

import logging


class RequestFormatter(logging.Formatter):
    """Formatter that tolerates missing structured extras.

    ``%(request_id)s`` and friends only exist on records emitted by
    :class:`todos.middleware.RequestLogMiddleware`. Every other record still
    needs a sensible placeholder, otherwise logging would itself throw.
    """

    _DEFAULTS = {
        "request_id": "-",
        "method": "-",
        "path": "-",
        "status_code": "-",
        "duration_ms": "-",
    }

    def format(self, record: logging.LogRecord) -> str:
        for field, default in self._DEFAULTS.items():
            if not hasattr(record, field):
                setattr(record, field, default)
        return super().format(record)
