import { TodoFilters } from './components/TodoFilters'
import { TodoInput } from './components/TodoInput'
import { TodoList } from './components/TodoList'
import { TodosProvider, useTodos } from './state/TodosContext'

function TodoApp() {
  const { activeCount, completedCount, clearCompleted, todos } = useTodos()

  const summary =
    todos.length === 0
      ? 'No tasks yet'
      : `${activeCount} active · ${completedCount} completed`

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Todos</h1>
          <p aria-live="polite" className="mt-1 text-sm text-slate-500">
            {summary}
          </p>
        </header>

        <TodoInput />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <TodoFilters />
          <button
            type="button"
            onClick={clearCompleted}
            disabled={completedCount === 0}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-2 focus:ring-slate-900/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Clear completed
          </button>
        </div>

        <TodoList />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <TodosProvider>
      <TodoApp />
    </TodosProvider>
  )
}
