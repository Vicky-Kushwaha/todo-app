/**
 * Todo state, backed by the REST API.
 *
 * Design notes, because the shape here is deliberate:
 *
 * - The server is the source of truth. The list is fetched on mount, and every
 *   mutation is a request; nothing is persisted locally.
 * - Mutations are applied optimistically so the UI stays instant, then the
 *   server's version of the row replaces the local one (the server assigns the
 *   real id and may trim the title).
 * - A failed mutation is rolled back and surfaced, never silently swallowed.
 * - Component API is unchanged (same function names and signatures), so the
 *   presentational components did not need to change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../api/todos'
import { ApiError } from '../api/todos'
import { createId } from '../lib/id'
import { MAX_TITLE_LENGTH, type Filter, type Todo } from '../types'
import { todosReducer } from './todosReducer'

type TodosContextValue = {
  todos: Todo[]
  visibleTodos: Todo[]
  filter: Filter
  activeCount: number
  completedCount: number
  /** True until the first list request settles. */
  isLoading: boolean
  /** Human-readable message for the most recent failure, if any. */
  error: string | null
  dismissError: () => void
  setFilter: (filter: Filter) => void
  addTodo: (title: string) => void
  toggleTodo: (id: string) => void
  editTodo: (id: string, title: string) => void
  removeTodo: (id: string) => void
  clearCompleted: () => void
}

const TodosContext = createContext<TodosContextValue | null>(null)

/** Prefix for ids of rows that only exist locally, pending their POST. */
const PENDING_PREFIX = 'pending-'

/** Prefer the server's field-level message, which is written for the user. */
function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) {
    return cause.fieldError('title') ?? cause.message
  }
  return 'Something went wrong. Please try again.'
}

export function TodosProvider({ children }: { children: ReactNode }) {
  const [todos, dispatch] = useReducer(todosReducer, [])
  const [filter, setFilter] = useState<Filter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The latest list, for event handlers that need the current state without
  // re-subscribing on every render.
  const todosRef = useRef(todos)
  useEffect(() => {
    todosRef.current = todos
  }, [todos])

  // In-flight POSTs by their temporary id. A click that lands before the create
  // has returned still needs to reach the real row, so follow-up requests wait
  // on the create rather than acting on a temporary id.
  const pendingCreates = useRef(new Map<string, Promise<Todo>>())

  // Local row id -> server id, for rows this session created.
  //
  // A row's id is deliberately *not* swapped for the server's when the POST
  // returns. TodoList keys rows by id, so changing it would remount the row and
  // throw away local component state — an edit in progress would vanish. The
  // server id lives here instead and `serverIdFor` resolves it at call time.
  const serverIds = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false

    api
      .listTodos()
      .then((remote) => {
        if (!cancelled) dispatch({ type: 'hydrated', todos: remote })
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Undo a failed mutation, then re-sync from the server.
   *
   * Restoring the snapshot is instant and always available; the follow-up fetch
   * converges with the server in case another request landed in between. If the
   * fetch fails too, the snapshot stays on screen and the error is already
   * shown, so there is nothing more to say to the user.
   */
  const recover = useCallback(async (snapshot: Todo[]) => {
    dispatch({ type: 'hydrated', todos: snapshot })
    try {
      const remote = await api.listTodos()
      dispatch({ type: 'hydrated', todos: remote })
    } catch {
      // Keep the restored snapshot.
    }
  }, [])

  /** Apply a change immediately, run the request, undo on failure. */
  const runOptimistic = useCallback(
    async (apply: () => void, request: () => Promise<void>) => {
      const snapshot = todosRef.current
      apply()

      try {
        await request()
      } catch (cause) {
        setError(messageOf(cause))
        await recover(snapshot)
      }
    },
    [recover],
  )

  /** Resolve a local row id to the server's id. */
  const serverIdFor = useCallback(async (id: string): Promise<string> => {
    const known = serverIds.current.get(id)
    if (known !== undefined) return known

    const pending = pendingCreates.current.get(id)
    if (!pending) return id

    // Still creating: wait for the POST, then look the id up. If the create
    // failed there is no server row, so surface the failure to the caller
    // rather than sending a request to an id that does not exist.
    await pending
    return serverIds.current.get(id) ?? id
  }, [])

  const addTodo = useCallback(
    (title: string) => {
      const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH)
      // Matches the reducer: a blank title is not a todo.
      if (trimmed === '') return

      const tempId = `${PENDING_PREFIX}${createId()}`
      const createRequest = api.createTodo(trimmed)
      pendingCreates.current.set(tempId, createRequest)

      void runOptimistic(
        () => dispatch({ type: 'added', title: trimmed, id: tempId, createdAt: Date.now() }),
        async () => {
          try {
            const created = await createRequest
            serverIds.current.set(tempId, created.id)
            // Same id, server-owned fields: the row keeps its identity (and any
            // component state) while showing what the server actually stored.
            dispatch({ type: 'replaced', id: tempId, todo: { ...created, id: tempId } })
          } finally {
            pendingCreates.current.delete(tempId)
          }
        },
      )
    },
    [runOptimistic],
  )

  const toggleTodo = useCallback(
    (id: string) => {
      const current = todosRef.current.find((todo) => todo.id === id)
      if (!current) return

      const nextCompleted = !current.completed

      void runOptimistic(
        () => dispatch({ type: 'toggled', id }),
        async () => {
          const serverId = await serverIdFor(id)
          const updated = await api.updateTodo(serverId, { completed: nextCompleted })
          dispatch({ type: 'replaced', id, todo: updated })
        },
      )
    },
    [runOptimistic, serverIdFor],
  )

  const editTodo = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH)
      const current = todosRef.current.find((todo) => todo.id === id)

      // An empty edit is a no-op, and so is a save that changed nothing: the
      // reducer behaves the same way, and this avoids a pointless request.
      if (trimmed === '' || !current || current.title === trimmed) return

      void runOptimistic(
        () => dispatch({ type: 'edited', id, title: trimmed }),
        async () => {
          const serverId = await serverIdFor(id)
          const updated = await api.updateTodo(serverId, { title: trimmed })
          dispatch({ type: 'replaced', id, todo: updated })
        },
      )
    },
    [runOptimistic, serverIdFor],
  )

  const removeTodo = useCallback(
    (id: string) => {
      void runOptimistic(
        () => dispatch({ type: 'removed', id }),
        async () => {
          const serverId = await serverIdFor(id)
          await api.deleteTodo(serverId)
          // The row is gone, so the id mapping is no longer needed.
          serverIds.current.delete(id)
        },
      )
    },
    [runOptimistic, serverIdFor],
  )

  const clearCompleted = useCallback(() => {
    void runOptimistic(
      () => dispatch({ type: 'completedCleared' }),
      async () => {
        await api.clearCompleted()
      },
    )
  }, [runOptimistic])

  const dismissError = useCallback(() => setError(null), [])

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
      isLoading,
      error,
      dismissError,
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
      isLoading,
      error,
      dismissError,
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
