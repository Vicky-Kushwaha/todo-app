import type { Filter } from '../types'

const COPY: Record<Filter, string> = {
  all: 'Nothing here yet. Add your first task above.',
  active: 'No active tasks. Nice.',
  completed: 'No completed tasks yet.',
}

export function EmptyState({ filter, hasTodos }: { filter: Filter; hasTodos: boolean }) {
  // "No active tasks" and "No completed tasks" only make sense once something exists.
  const message = hasTodos || filter === 'all' ? COPY[filter] : COPY.all

  return (
    <p className="mt-6 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </p>
  )
}
