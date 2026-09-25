import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './state/storage'
import type { Todo } from './types'

beforeEach(() => {
  window.localStorage.clear()
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

describe('<App />', () => {
  it('shows the empty state when there is nothing to do', () => {
    render(<App />)

    expect(screen.getByText(/add your first task/i)).toBeInTheDocument()
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('adds a task and clears the input', async () => {
    render(<App />)

    await addTask('Buy milk')

    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked()
    expect(screen.getByLabelText('New task')).toHaveValue('')
    expect(screen.getByText('1 active · 0 completed')).toBeInTheDocument()
  })

  it('will not submit a blank task', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('New task'), '   ')

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('toggles a task complete and back', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')

    const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(screen.getByText('0 active · 1 completed')).toBeInTheDocument()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('edits a task title', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Buy milk' })
    await user.clear(editField)
    await user.type(editField, 'Buy oat milk{Enter}')

    expect(screen.getByRole('checkbox', { name: 'Buy oat milk' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Edit Buy milk' })).not.toBeInTheDocument()
  })

  it('discards an edit on Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editField = screen.getByRole('textbox', { name: 'Edit Buy milk' })
    await user.clear(editField)
    await user.type(editField, 'Buy oat milk{Escape}')

    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
  })

  it('deletes a task', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')

    await user.click(taskRow('Buy milk').getByRole('button', { name: 'Delete' }))

    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument()
    expect(screen.getByText(/add your first task/i)).toBeInTheDocument()
  })

  it('filters between active and completed tasks', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')
    await addTask('Walk dog')
    await user.click(screen.getByRole('checkbox', { name: 'Walk dog' }))

    await user.click(screen.getByRole('button', { name: 'Active' }))
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Walk dog' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Completed' }))
    expect(screen.getByRole('checkbox', { name: 'Walk dog' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Buy milk' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('clears completed tasks', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addTask('Buy milk')
    await addTask('Walk dog')
    await user.click(screen.getByRole('checkbox', { name: 'Walk dog' }))

    await user.click(screen.getByRole('button', { name: 'Clear completed' }))

    expect(screen.queryByRole('checkbox', { name: 'Walk dog' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument()
  })

  it('persists tasks to localStorage', async () => {
    render(<App />)
    await addTask('Buy milk')

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as Todo[]

    expect(stored).toHaveLength(1)
    expect(stored[0]?.title).toBe('Buy milk')
  })

  it('restores saved tasks on mount and ignores corrupt storage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', title: 'Saved task', completed: true, createdAt: 1 },
        { id: '2', title: '', completed: false, createdAt: 2 },
        { id: '3', completed: false },
      ]),
    )

    render(<App />)

    expect(screen.getByRole('checkbox', { name: 'Saved task' })).toBeChecked()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('falls back to an empty list when storage holds invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')

    render(<App />)

    expect(screen.getByText(/add your first task/i)).toBeInTheDocument()
  })
})
