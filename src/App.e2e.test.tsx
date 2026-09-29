/**
 * Live end-to-end test: the real component tree against a real server.
 *
 * Nothing is mocked here. Rendering <App /> performs real HTTP requests through
 * the Vite dev proxy to Django and SQLite, so this is the test that proves the
 * wiring rather than assuming it. It asserts persistence across a remount,
 * which is what distinguishes "the state came from the database" from "the
 * state was kept in the component".
 *
 * Opt-in, because it needs both servers running:
 *
 *   cd backend && .venv/bin/python manage.py runserver 127.0.0.1:8000
 *   npm run dev                                     # http://127.0.0.1:5173
 *   VITE_RUN_INTEGRATION=1 npm run test:run
 *
 * Requests go to VITE_E2E_BASE_URL (default the Vite dev server) so the proxy
 * path is exercised too. It writes to and deletes from that database, so point
 * it at a development one.
 *
 * Every test waits for the server to reflect a change before remounting. The
 * requests are deliberately not awaited by the UI, so remounting immediately
 * would race the write and produce a flaky failure rather than a real one.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { deleteTodo, listTodos } from './api/todos'
import type { Todo } from './types'

const env = import.meta.env
const configuredBaseUrl = typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL : ''
const baseUrl =
  configuredBaseUrl !== ''
    ? configuredBaseUrl
    : typeof env.VITE_E2E_BASE_URL === 'string' && env.VITE_E2E_BASE_URL !== ''
      ? env.VITE_E2E_BASE_URL
      : 'http://127.0.0.1:5173'
const runIntegration = env.VITE_RUN_INTEGRATION === '1'

/** Remove everything through the API so each test starts from a known state. */
async function removeAll(): Promise<void> {
  const existing = await listTodos()
  await Promise.all(existing.map((todo) => deleteTodo(todo.id)))
}

/** Poll the server until it reflects the expected state. */
async function waitForServer(
  predicate: (todos: Todo[]) => boolean,
  description: string,
): Promise<void> {
  await waitFor(
    async () => {
      const todos = await listTodos()
      if (!predicate(todos)) throw new Error(`server had not yet: ${description}`)
    },
    { timeout: 5000, interval: 100 },
  )
}

async function addTask(title: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New task'), title)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

function rowActions(title: string) {
  const checkbox = screen.getByRole('checkbox', { name: title })
  const row = checkbox.closest('li')
  if (!row) throw new Error(`No list item found for "${title}"`)
  return within(row)
}

describe.runIf(runIntegration)('the wired app, live', () => {
  beforeAll(() => {
    // apiBaseUrl() reads the env per call, so stubbing here points every
    // request in this file at the Vite dev server.
    if (configuredBaseUrl === '') vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  })

  beforeEach(async () => {
    await removeAll()
  })

  it('loads an empty list from the server', async () => {
    render(<App />)

    expect(await screen.findByText(/add your first task/i)).toBeInTheDocument()
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('keeps an added task after a remount, so it came from the database', async () => {
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')
    await waitForServer((todos) => todos.length === 1, 'stored the task')

    // A remount rebuilds all component state from scratch: only a task that
    // reached the server can reappear.
    first.unmount()
    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked()
  })

  it('keeps a toggle after a remount', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Walk dog')
    await screen.findByRole('checkbox', { name: 'Walk dog' })
    await user.click(screen.getByRole('checkbox', { name: 'Walk dog' }))

    await waitForServer((todos) => todos[0]?.completed === true, 'stored the toggle')

    first.unmount()
    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'Walk dog' })).toBeChecked()
  })

  it('keeps an edit after a remount and stores the trimmed title', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Walk dog')
    await screen.findByRole('checkbox', { name: 'Walk dog' })
    await waitForServer((todos) => todos.length === 1, 'stored the task')

    await user.click(rowActions('Walk dog').getByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Walk dog' })
    await user.clear(editField)
    await user.type(editField, '  Walk the dog  {Enter}')

    await waitForServer((todos) => todos[0]?.title === 'Walk the dog', 'stored the edit')

    first.unmount()
    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'Walk the dog' })).toBeInTheDocument()
  })

  it('keeps a delete after a remount', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')
    await screen.findByRole('checkbox', { name: 'Buy milk' })
    await waitForServer((todos) => todos.length === 1, 'stored the task')

    await user.click(rowActions('Buy milk').getByRole('button', { name: 'Delete' }))
    await waitForServer((todos) => todos.length === 0, 'deleted the task')

    first.unmount()
    render(<App />)

    expect(await screen.findByText(/add your first task/i)).toBeInTheDocument()
  })

  it('keeps a bulk clear after a remount', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    await addTask('Buy milk')
    await addTask('Walk dog')
    await waitForServer((todos) => todos.length === 2, 'stored both tasks')

    await user.click(screen.getByRole('checkbox', { name: 'Walk dog' }))
    await waitForServer((todos) => todos.some((todo) => todo.completed), 'stored the toggle')

    await user.click(screen.getByRole('button', { name: 'Clear completed' }))
    await waitForServer((todos) => todos.length === 1, 'cleared the completed task')

    first.unmount()
    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Walk dog' })).not.toBeInTheDocument()
  })

  it('caps an over-long title at the limit the server enforces', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByText(/add your first task/i)

    // The input enforces maxLength for typed input, so set the value directly:
    // this proves the client-side cap, not the browser's, is what keeps the
    // server's 200-character limit satisfied.
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'x'.repeat(250) } })
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitForServer((todos) => todos[0]?.title.length === 200, 'stored a capped title')

    first.unmount()
    render(<App />)

    expect(await screen.findByRole('checkbox', { name: 'x'.repeat(200) })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
