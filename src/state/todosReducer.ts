import { createId } from '../lib/id'
import { MAX_TITLE_LENGTH, type Todo } from '../types'

export type TodosAction =
  | { type: 'added'; title: string; id?: string; createdAt?: number }
  | { type: 'toggled'; id: string }
  | { type: 'edited'; id: string; title: string }
  | { type: 'removed'; id: string }
  | { type: 'completedCleared' }
  | { type: 'hydrated'; todos: Todo[] }

export function todosReducer(todos: Todo[], action: TodosAction): Todo[] {
  switch (action.type) {
    case 'added': {
      const title = action.title.trim().slice(0, MAX_TITLE_LENGTH)
      if (title === '') return todos

      const todo: Todo = {
        id: action.id ?? createId(),
        title,
        completed: false,
        createdAt: action.createdAt ?? Date.now(),
      }

      return [todo, ...todos]
    }

    case 'toggled':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, completed: !todo.completed } : todo,
      )

    case 'edited': {
      const title = action.title.trim().slice(0, MAX_TITLE_LENGTH)
      // An empty edit is treated as "no change" — cancelling is the caller's job.
      if (title === '') return todos

      return todos.map((todo) => (todo.id === action.id ? { ...todo, title } : todo))
    }

    case 'removed':
      return todos.filter((todo) => todo.id !== action.id)

    case 'completedCleared':
      return todos.filter((todo) => !todo.completed)

    case 'hydrated':
      return action.todos

    default:
      return todos
  }
}
