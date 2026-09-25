import { useTodos } from '../state/TodosContext'
import { EmptyState } from './EmptyState'
import { TodoItem } from './TodoItem'

export function TodoList() {
  const { visibleTodos, filter, todos } = useTodos()

  if (visibleTodos.length === 0) {
    return <EmptyState filter={filter} hasTodos={todos.length > 0} />
  }

  return (
    <ul aria-label="Tasks" className="mt-4 space-y-2">
      {visibleTodos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
