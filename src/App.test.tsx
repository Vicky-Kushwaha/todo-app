/**
 * App-level tests.
 *
 * The API module is mocked, so these assert the wiring the UI depends on:
 * what gets requested, when the optimistic state is replaced by the server's
 * version, and that a failure rolls back and tells the user.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as api from './api/todos'
import { ApiError } from './api/todos'
import type { Todo } from './types'

vi.mock('./api/todos', async () => {
  const actual = await vi.importActual<typeof import('./api/todos')>('./api/todos')

  return {
    ...actual,
    listTodos: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    clearCompleted: vi.fn(),
  }
})

const listTodos = vi.mocked(api.listTodos)
const createTodo = vi.mocked(api.createTodo)
const updateTodo = vi.mocked(api.updateTodo)
const deleteTodo = vi.mocked(api.deleteTodo)
const clearCompleted = vi.mocked(api.clearCompleted)

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return { id: 'server-1', title: 'Buy milk', completed: false, createdAt: 1000, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()

  listTodos.mockResolvedValue([])
  createTodo.mockImplementation(async (title: string) => makeTodo({ id: 'server-new', title }))
  updateTodo.mockImplementation(async (id: string, patch: { title?: string; completed?: boolean }) =>
    makeTodo({ id, ...patch }),
  )
  deleteTodo.mockResolvedValue(undefined)
  clearCompleted.mockResolvedValue(0)
})

async function addTask(title: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New task'), title)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

function taskRow(title: string) {
  const checkbox = screen.getByRole('checkbox', { name: title })
  const row = checkbox.closest('li')
  if (!row) throw new Error(`No list item found for "${title}"`)
  return within(row)
}

describe('<App /> rendering', () => {
  it('shows a loading state until the first list request settles', () => {
    listTodos.mockReturnValue(new Promise(() => {}))

    render(<App />)

    expect(screen.getByText('Loading tasks…')).toBeInTheDocument()
  })

  it('renders the todos the server returns', async () => {
    listTodos.mockResolvedValue([makeTodo({ title: 'Saved task', completed: true })])

    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'Saved task' })).toBeChecked()
    expect(screen.getByText('0 active · 1 completed')).toBeInTheDocument()
    expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument()
  })

  it('shows the empty state when the server has no todos', async () => {
    render(<App />)

    expect(await screen.findByText(/add your first task/i)).toBeInTheDocument()
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('shows an error when the initial load fails', async () => {
    listTodos.mockRejectedValue(
      new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.'),
    )

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })

  it('lets the user dismiss an error', async () => {
    listTodos.mockRejectedValue(new ApiError(500, 'server_error', 'Boom'))
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('<App /> adding', () => {
  it('posts a new task and shows it immediately', async () => {
    render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')

    expect(createTodo).toHaveBeenCalledWith('Buy milk')
    expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked()
    expect(screen.getByLabelText('New task')).toHaveValue('')
    expect(screen.getByText('1 active · 0 completed')).toBeInTheDocument()
  })

  it('will not submit a blank task', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/add your first task/i)

    await user.type(screen.getByLabelText('New task'), '   ')

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(createTodo).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('swaps the optimistic row for the server row, so later calls use the real id', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(taskRow('Buy milk').getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteTodo).toHaveBeenCalledWith('server-new'))
  })

  it('rolls back a failed create and shows the server validation message', async () => {
    createTodo.mockRejectedValue(
      new ApiError(400, 'validation_error', 'Validation failed.', {
        title: ['Title must not be blank.'],
      }),
    )

    render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')

    expect(await screen.findByRole('alert')).toHaveTextContent('Title must not be blank.')
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument(),
    )
  })
})

describe('<App /> toggling', () => {
  it('toggles a task and patches the server', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])

    render(<App />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(checkbox)

    expect(checkbox).toBeChecked()
    await waitFor(() => expect(updateTodo).toHaveBeenCalledWith('server-1', { completed: true }))
  })

  it('rolls back a failed toggle and reports it', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])
    updateTodo.mockRejectedValue(new ApiError(500, 'server_error', 'Boom'))

    render(<App />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(checkbox)

    // The optimistic toggle is rolled back once the request fails, so the
    // meaningful assertions are the steady state and the reported error. (The
    // optimistic tick itself is covered by the successful-toggle test.)
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked(),
    )
  })

  it('applies a toggle made while the create is still in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate: (todo: Todo) => void = () => {}
    createTodo.mockImplementation(
      () =>
        new Promise<Todo>((resolve) => {
          resolveCreate = resolve
        }),
    )

    render(<App />)
    await screen.findByText(/add your first task/i)
    await addTask('Buy milk')

    // The POST has not returned yet, so this row still has a temporary id.
    await user.click(await screen.findByRole('checkbox', { name: 'Buy milk' }))

    resolveCreate(makeTodo({ id: 'server-9', title: 'Buy milk' }))

    await waitFor(() => expect(updateTodo).toHaveBeenCalledWith('server-9', { completed: true }))
  })

  it('keeps an in-progress edit when the create resolves', async () => {
    // A row is keyed by its id, so swapping in the server's id remounts it and
    // drops component state. This pins the fix: the row keeps its own id and
    // the server id is resolved behind the scenes.
    const user = userEvent.setup()
    let resolveCreate: (todo: Todo) => void = () => {}
    createTodo.mockImplementation(
      () =>
        new Promise<Todo>((resolve) => {
          resolveCreate = resolve
        }),
    )

    render(<App />)
    await screen.findByText(/add your first task/i)
    await addTask('Buy milk')

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Buy milk' })

    resolveCreate(makeTodo({ id: 'server-9', title: 'Buy milk' }))

    // Same DOM node, not a replacement: the row was not remounted.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Edit Buy milk' })).toBe(editField),
    )

    // And the in-progress edit still commits against the server's id.
    await user.type(editField, ' oat{Enter}')

    await waitFor(() =>
      expect(updateTodo).toHaveBeenCalledWith('server-9', { title: 'Buy milk oat' }),
    )
  })
})

describe('<App /> editing', () => {
  it('patches the title', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Buy milk' })
    await user.clear(editField)
    await user.type(editField, 'Buy oat milk{Enter}')

    await waitFor(() => expect(updateTodo).toHaveBeenCalledWith('server-1', { title: 'Buy oat milk' }))
    expect(screen.getByRole('checkbox', { name: 'Buy oat milk' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Edit Buy milk' })).not.toBeInTheDocument()
  })

  it('discards an edit on Escape without calling the API', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Buy milk' })
    await user.clear(editField)
    await user.type(editField, 'Buy oat milk{Escape}')

    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
    expect(updateTodo).not.toHaveBeenCalled()
  })

  it('does not patch when the title is unchanged', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.type(screen.getByRole('textbox', { name: 'Edit Buy milk' }), '{Enter}')

    expect(updateTodo).not.toHaveBeenCalled()
  })
})

describe('<App /> removing', () => {
  it('deletes a task', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(taskRow('Buy milk').getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteTodo).toHaveBeenCalledWith('server-1'))
    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument()
    expect(screen.getByText(/add your first task/i)).toBeInTheDocument()
  })

  it('restores a task whose delete failed', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([makeTodo()])
    deleteTodo.mockRejectedValue(new ApiError(500, 'server_error', 'Boom'))

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Buy milk' })

    await user.click(taskRow('Buy milk').getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument(),
    )
  })

  it('clears completed tasks through the bulk endpoint', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([
      makeTodo(),
      makeTodo({ id: 'server-2', title: 'Walk dog', completed: true }),
    ])
    clearCompleted.mockResolvedValue(1)

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Walk dog' })

    await user.click(screen.getByRole('button', { name: 'Clear completed' }))

    await waitFor(() => expect(clearCompleted).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('checkbox', { name: 'Walk dog' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
    expect(deleteTodo).not.toHaveBeenCalled()
  })
})

describe('<App /> filtering', () => {
  it('filters between active and completed tasks', async () => {
    const user = userEvent.setup()
    listTodos.mockResolvedValue([
      makeTodo(),
      makeTodo({ id: 'server-2', title: 'Walk dog', completed: true }),
    ])

    render(<App />)
    await screen.findByRole('checkbox', { name: 'Walk dog' })

    await user.click(screen.getByRole('button', { name: 'Active' }))
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Walk dog' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Completed' }))
    expect(screen.getByRole('checkbox', { name: 'Walk dog' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
