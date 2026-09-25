import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type { Filter, Todo } from '../types'
import { loadTodos, saveTodos } from './storage'
import { todosReducer } from './todosReducer'

type TodosContextValue = {
  todos: Todo[]
  visibleTodos: Todo[]
  filter: Filter
  activeCount: number
  completedCount: number
  setFilter: (filter: Filter) => void
  addTodo: (title: string) => void
  toggleTodo: (id: string) => void
  editTodo: (id: string, title: string) => void
  removeTodo: (id: string) => void
  clearCompleted: () => void
}

const TodosContext = createContext<TodosContextValue | null>(null)

export function TodosProvider({ children }: { children: ReactNode }) {
  const [todos, dispatch] = useReducer(todosReducer, undefined, loadTodos)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    saveTodos(todos)
  }, [todos])

  const addTodo = useCallback((title: string) => dispatch({ type: 'added', title }), [])
  const toggleTodo = useCallback((id: string) => dispatch({ type: 'toggled', id }), [])
  const editTodo = useCallback(
    (id: string, title: string) => dispatch({ type: 'edited', id, title }),
    [],
  )
  const removeTodo = useCallback((id: string) => dispatch({ type: 'removed', id }), [])
  const clearCompleted = useCallback(() => dispatch({ type: 'completedCleared' }), [])

  const activeCount = todos.filter((todo) => !todo.completed).length
  const completedCount = todos.length - activeCount

  const visibleTodos = useMemo(() => {
    if (filter === 'active') return todos.filter((todo) => !todo.completed)
    if (filter === 'completed') return todos.filter((todo) => todo.completed)
    return todos
  }, [filter, todos])

  const value = useMemo<TodosContextValue>(
    () => ({
      todos,
      visibleTodos,
      filter,
      activeCount,
      completedCount,
      setFilter,
      addTodo,
      toggleTodo,
      editTodo,
      removeTodo,
      clearCompleted,
    }),
    [
      todos,
      visibleTodos,
      filter,
      activeCount,
      completedCount,
      addTodo,
      toggleTodo,
      editTodo,
      removeTodo,
      clearCompleted,
    ],
  )

  return <TodosContext.Provider value={value}>{children}</TodosContext.Provider>
}

export function useTodos(): TodosContextValue {
  const context = useContext(TodosContext)

  if (context === null) {
    throw new Error('useTodos must be used inside a <TodosProvider>')
  }

  return context
}
