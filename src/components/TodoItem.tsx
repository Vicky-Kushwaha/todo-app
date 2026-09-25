import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTodos } from '../state/TodosContext'
import { MAX_TITLE_LENGTH, type Todo } from '../types'

const itemButtonClass =
  'rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:ring-2 focus:ring-slate-900/20 focus:outline-none'

export function TodoItem({ todo }: { todo: Todo }) {
  const { toggleTodo, editTodo, removeTodo } = useTodos()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) editInputRef.current?.select()
  }, [isEditing])

  function startEditing() {
    setDraft(todo.title)
    setIsEditing(true)
  }

  function commitEdit() {
    editTodo(todo.id, draft)
    setIsEditing(false)
  }

  function cancelEdit() {
    setDraft(todo.title)
    setIsEditing(false)
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const checkboxId = `todo-checkbox-${todo.id}`

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <input
        id={checkboxId}
        type="checkbox"
        checked={todo.completed}
        onChange={() => toggleTodo(todo.id)}
        className="size-4 shrink-0 accent-slate-900"
      />

      {isEditing ? (
        <input
          ref={editInputRef}
          type="text"
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          aria-label={`Edit ${todo.title}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          className="min-w-0 flex-1 rounded-md border border-slate-400 px-2 py-1 text-base text-slate-900 focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
        />
      ) : (
        <label
          htmlFor={checkboxId}
          onDoubleClick={startEditing}
          title="Double-click to edit"
          className={`min-w-0 flex-1 cursor-pointer truncate text-base ${
            todo.completed ? 'text-slate-400 line-through' : 'text-slate-900'
          }`}
        >
          {todo.title}
        </label>
      )}

      <button type="button" onClick={startEditing} className={itemButtonClass}>
        Edit
      </button>
      <button type="button" onClick={() => removeTodo(todo.id)} className={itemButtonClass}>
        Delete
      </button>
    </li>
  )
}
