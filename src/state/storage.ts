import { MAX_TITLE_LENGTH, type Todo } from '../types'

export const STORAGE_KEY = 'todo-app.todos.v1'

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    candidate.title.trim() !== '' &&
    typeof candidate.completed === 'boolean' &&
    typeof candidate.createdAt === 'number'
  )
}

/**
 * Reads persisted todos. Storage can be unavailable (private mode, disabled
 * cookies) or hold data written by an older version, so any failure or
 * unusable shape degrades to an empty list rather than throwing.
 */
export function loadTodos(): Todo[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isTodo).map((todo) => ({
      ...todo,
      title: todo.title.slice(0, MAX_TITLE_LENGTH),
    }))
  } catch {
    return []
  }
}

export function saveTodos(todos: Todo[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  } catch {
    // Storage full or blocked: keep the in-memory list working, don't break the UI.
  }
}
