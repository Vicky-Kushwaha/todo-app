# Todo app

Full-stack todo list. React 19 + TypeScript frontend, Django REST Framework
backend on SQLite. Tasks live in the database, not the browser.

## Layout

    src/         React frontend (Vite, Tailwind, reducer state in Context)
    backend/     Django REST API — see backend/README.md

## Run

Two processes. Start the API first:

    cd backend
    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
    cp .env.example .env          # then set DJANGO_DEBUG=true and a dev DJANGO_SECRET_KEY
    .venv/bin/python manage.py migrate
    .venv/bin/python manage.py runserver 127.0.0.1:8000

Then the frontend, from the repository root:

    npm install
    npm run dev        # http://localhost:5173
    npm run test:run   # Vitest + React Testing Library
    npm run typecheck
    npm run build      # typecheck + production bundle into dist/

The dev server proxies `/api` to `http://127.0.0.1:8000` (see
`vite.config.ts`), so development needs no CORS and no API base URL. To call a
different origin instead, set `VITE_API_BASE_URL` (see `.env.example`) and add
that origin to the backend's `DJANGO_CORS_ALLOWED_ORIGINS`.

## Features

- Add, edit (double-click the label or use the Edit button), complete and delete tasks
- Filters: All / Active / Completed
- Clear completed
- Persists to the backend; the list is reloaded from the server on mount

## Structure

    src/
      api/todos.ts     typed client — the only module that knows about HTTP
      components/      presentational UI (input, list, item, filters, empty state)
      state/           todosReducer (pure), TodosContext (API-backed)
      lib/id.ts        id generation for optimistic rows
      types.ts         Todo + Filter types

State lives in one reducer behind Context (`useTodos`). The reducer stays pure
and unit tested on its own; the context owns the requests.

## How writing works

The server is the source of truth and no component talks to it directly.

- Mutations apply optimistically, then the server's version of the row replaces
  the local one. The UI stays instant without misrepresenting what is stored.
- A failed mutation is rolled back, re-synced from the server, and reported in a
  banner. Nothing is swallowed.
- A row created but not yet confirmed keeps its local id, and the server id is
  resolved in `serverIdFor`. Rows are keyed by id, so swapping the id would
  remount the row and discard state — an in-progress edit would vanish. The same
  path lets a click that lands before the create returns still reach the right
  row.
- Errors use one shape (`ApiError` with `status`, `code`, `message`, `fields`),
  so a server validation message can be attached to the offending field.

## Testing

Two suites, one per half of the stack.

    npm run test:run                            # frontend: unit + component, API mocked
    cd backend && .venv/bin/python -m pytest    # backend: 57 tests

The frontend has two extra opt-in layers that need a live server:

    # the typed client against the real endpoints
    VITE_RUN_INTEGRATION=1 npm run test:run

    # the real component tree against the real server, through the Vite proxy
    VITE_RUN_INTEGRATION=1 npx vitest run src/App.e2e.test.tsx

The e2e test needs both the API and `npm run dev` running, and asserts that
changes survive a remount — which is what proves the data came from the database
rather than component state. Both layers write to the target database: use a
development one.

## Not done / open questions

- **No authentication.** The API has none; see the backend README. There is no
  login flow, so the app assumes it is the only user. Do not expose the API on a
  public interface until this is decided.
- No routing, no multi-list support, no due dates, no drag-and-drop ordering.
- Built without a design handoff — layout and styling are a reasonable default,
  not a match to a spec.
- No browser-automation suite: the e2e test above drives the real component tree
  in jsdom against a real server, but no real browser. Add Playwright if
  cross-browser behaviour or real layout ever needs checking.
- Editing is last-write-wins against the server; there is no conflict detection
  if the same task is edited in two places at once.
