# Todo app

React + TypeScript + Vite todo list. Client-side only, no backend wired up yet.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run test:run   # Vitest + React Testing Library
    npm run typecheck
    npm run build      # typecheck + production bundle into dist/

## Features

- Add, edit (double-click the label or use the Edit button), complete and delete tasks
- Filters: All / Active / Completed
- Clear completed
- Persists to `localStorage` under `todo-app.todos.v1`

## Structure

    src/
      components/     presentational UI (input, list, item, filters, empty state)
      state/          todosReducer (pure), storage (localStorage I/O), TodosContext
      lib/id.ts       id generation
      types.ts        Todo + Filter types

State lives in one reducer behind Context (`useTodos`). The reducer is pure and unit
tested on its own; components read it through the hook so they stay reusable.

## Not done / open questions

- **No API integration.** Tasks live in the browser only. The REST contract
  (endpoints, payload shape, error responses, auth) has not been agreed with the
  backend developer, and inventing one seemed worse than asking.
- No routing, no multi-list support, no due dates, no drag-and-drop ordering.
- Built without a design handoff — layout and styling are a reasonable default,
  not a match to a spec.
- No end-to-end (browser) test suite; coverage is unit + component tests.
