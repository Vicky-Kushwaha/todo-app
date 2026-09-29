# Todo API

Django + Django REST Framework backend for the React todo app at the repository
root (`src/`).

SQLite, no authentication (see **Open questions** — that is an undecided item, not
a recommendation). Built to be read: one error shape, no hidden magic in the
views, and a contract documented below that a frontend dev can integrate against
without asking.

## Requirements

- Python 3.11+
- No Node, no Docker needed for development

## Setup

All commands run from this directory (`backend/`):

    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
    cp .env.example .env          # then set DJANGO_SECRET_KEY
    .venv/bin/python manage.py migrate
    .venv/bin/python manage.py runserver 127.0.0.1:8000

`DJANGO_DEBUG` defaults to `false`, and the project refuses to start with the
development key while debug is off. For local work, set in `.env`:

    DJANGO_DEBUG=true
    DJANGO_SECRET_KEY=<any dev value>

Generate a real secret with:

    python -c "import secrets; print(secrets.token_urlsafe(50))"

## Tests

    .venv/bin/python -m pytest

57 tests: CRUD, validation, the bulk clear, filtering, 404s, the error envelope,
the database constraint, the JSON catch-all, and the settings helpers.

Note the endpoint tests run against in-memory SQLite, so they cannot catch a bad
`DJANGO_DB_PATH` — Django substitutes an in-memory database under test and an
empty database name goes unnoticed. That is what `config/tests/test_settings.py`
is for, and it is worth knowing before you trust a green suite as proof that
`manage.py runserver` will start.

## Endpoints

Base path `/api/`.

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/todos/` | List todos, newest first. `?completed=true\|false` filters. | 200 array |
| POST | `/api/todos/` | Create. Body `{"title": "..."}`. | 201 object |
| GET | `/api/todos/{id}/` | Retrieve one. | 200 object |
| PATCH | `/api/todos/{id}/` | Partial update. `{"title"?: ..., "completed"?: ...}` | 200 object |
| DELETE | `/api/todos/{id}/` | Delete one. | 204 no body |
| DELETE | `/api/todos/completed/` | Delete every completed todo. | 200 `{"deleted": n}` |
| GET | `/api/health/` | Liveness + database check. | 200 / 503 |
| GET | `/api/schema/` | OpenAPI 3 schema. | 200 |
| GET | `/api/docs/` | Swagger UI. | 200 |

`PUT` is deliberately not implemented: clients update one field at a time and
accepting `PUT` would invite accidental field clearing. It returns 405 with the
standard envelope.

### Todo object

```json
{
  "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "title": "Buy milk",
  "completed": false,
  "createdAt": 1735700000000,
  "updatedAt": 1735700004123
}
```

- `id` is a server-generated UUIDv4. A client-supplied `id` is ignored.
- `createdAt` / `updatedAt` are **epoch milliseconds**, matching the frontend
  `Todo` type (`createdAt: number`). The database stores timezone-aware
  datetimes; the conversion lives in the serializer.
- `title` is required, trimmed, and limited to 200 characters — the same limit
  the frontend uses (`MAX_TITLE_LENGTH` in `src/types.ts`).

### Error shape

Every 4xx and 5xx — including unrouted URLs — returns:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed.",
    "fields": { "title": ["Title must not be blank."] }
  }
}
```

`fields` is present only when the failure is field-specific. `code` is stable and
machine-readable: `validation_error`, `not_found`, `method_not_allowed`,
`parse_error`, `permission_denied`, `not_authenticated`, `throttled`,
`unsupported_media_type`, `bad_request`, `server_error`.

### CORS and the frontend

The Vite dev server proxies `/api` to this service, so development needs no CORS
at all. If the frontend calls cross-origin instead, list its origin in
`DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated, no wildcard).

## Architecture notes

    config/            settings, urls, logging formatter, wsgi/asgi
    config/tests/      settings helper tests (blank env var = unset)
    todos/
      models.py        Todo, plus a DB check constraint against blank titles
      serializers.py   wire shape, epoch-ms conversion, title validation
      views.py         TodoViewSet, health, JSON catch-all 404
      exceptions.py    the single error envelope
      middleware.py    request id + one log line per request
      tests/           endpoint and model tests

- **Logging** emits one line per request: request id, method, path, status and
  duration. Request bodies, titles, query strings and headers are deliberately
  not logged — todo titles are user content. The request id is returned on
  `X-Request-ID`.
- **Validation** happens in the serializer and again as a database constraint, so
  a blank title cannot reach the table through a shell or admin action.
- **No pagination.** `GET /api/todos/` returns a plain array. The frontend keeps
  the whole list in memory and filters client-side, and a todo list is small.
  Revisit if a single collection is expected to run into the thousands.
- **`?completed=`** is validated: an unrecognised value is a 400 rather than a
  silently ignored filter.

## Open questions

- **Authentication is not implemented.** Everything is `AllowAny`
  (`DEFAULT_PERMISSION_CLASSES` in `config/settings.py`). This is fine for a
  single-user app on localhost and **not** fine for anything reachable by a
  second person or a network. Decide between no auth (single-user local),
  Token auth (DRF built-in, per-user accounts) or JWT, then this needs a
  `user` foreign key on `Todo`, scoped querysets, and a login flow on the
  frontend. Do not expose this service on a public interface until then.
- **`DEBUG=false` requires a real `SECRET_KEY`**, and HTTPS hardening
  (`DJANGO_SECURE_SSL_REDIRECT`, HSTS) is env-gated and off by default for local
  http. Turn it on behind TLS.
- **Concurrency:** the "clear completed" endpoint deletes in one query, so it is
  not racy. Individual updates are last-write-wins with no version field; fine
  for one user, a real question for many.
