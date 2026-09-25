import { describe, expect, it } from 'vitest'
import { todosReducer } from './todosReducer'
import type { Todo } from '../types'

const milk: Todo = { id: '1', title: 'Buy milk', completed: false, createdAt: 1 }
const bread: Todo = { id: '2', title: 'Buy bread', completed: true, createdAt: 2 }

describe('todosReducer', () => {
  it('adds a new todo to the front of the list', () => {
    const next = todosReducer([bread], { type: 'added', title: 'Buy milk', id: 'x', createdAt: 5 })

    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({ id: 'x', title: 'Buy milk', completed: false, createdAt: 5 })
  })

  it('trims the title and ignores blank input', () => {
    expect(todosReducer([], { type: 'added', title: '   ' })).toEqual([])

    const next = todosReducer([], { type: 'added', title: '  Walk dog  ', id: 'x' })
    expect(next[0]?.title).toBe('Walk dog')
  })

  it('toggles only the matching todo', () => {
    const next = todosReducer([milk, bread], { type: 'toggled', id: '1' })

    expect(next.find((todo) => todo.id === '1')?.completed).toBe(true)
    expect(next.find((todo) => todo.id === '2')?.completed).toBe(true)
  })

  it('renames the matching todo', () => {
    const next = todosReducer([milk, bread], { type: 'edited', id: '1', title: 'Buy oat milk' })

    expect(next[0]?.title).toBe('Buy oat milk')
    expect(next[1]).toEqual(bread)
  })

  it('keeps the previous title when an edit is emptied', () => {
    expect(todosReducer([milk], { type: 'edited', id: '1', title: '   ' })).toEqual([milk])
  })

  it('removes the matching todo', () => {
    expect(todosReducer([milk, bread], { type: 'removed', id: '1' })).toEqual([bread])
  })

  it('clears only completed todos', () => {
    expect(todosReducer([milk, bread], { type: 'completedCleared' })).toEqual([milk])
  })

  it('returns the same reference for unknown actions', () => {
    const state = [milk]
    // @ts-expect-error — unknown action type, exercising the default branch
    const next = todosReducer(state, { type: 'nope' })

    expect(next).toBe(state)
  })
})
