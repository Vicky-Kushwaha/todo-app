import { useTodos } from '../state/TodosContext'
import type { Filter } from '../types'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export function TodoFilters() {
  const { filter, setFilter } = useTodos()

  return (
    <nav aria-label="Filter tasks" className="flex gap-1">
      {FILTERS.map(({ value, label }) => {
        const isActive = filter === value

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setFilter(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-slate-900/20 focus:outline-none ${
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
