/**
 * End-to-end check against a real, running backend.
 *
 * Skipped unless VITE_RUN_INTEGRATION=1, so the default `npm run test:run` never
 * needs a server. Run it with the API up:
 *
 *   cd ../todo-api && .venv/bin/python manage.py runserver 127.0.0.1:8000
 *   VITE_RUN_INTEGRATION=1 npm run test:run
 *
 * This exercises the real client module against the real endpoints — the
 * serialization, the error envelope and the id round-trip included. It writes
 * to and deletes from the target database, so point it at a development one.
 * The base URL comes from VITE_API_BASE_URL and defaults to localhost:8000;
 * environment is read through import.meta.env rather than process, so the test
 * needs no Node type definitions.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createTodo, deleteTodo, listTodos, updateTodo } from './todos'
import type { Todo } from '../types'

const env = import.meta.env
const configuredBaseUrl = typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL : ''
const baseUrl = configuredBaseUrl !== '' ? configuredBaseUrl : 'http://127.0.0.1:8000'
const runIntegration = env.VITE_RUN_INTEGRATION === '1'

async function removeAll(): Promise<void> {
  const existing = await listTodos()
  await Promise.all(existing.map((todo) => deleteTodo(todo.id)))
}

describe.runIf(runIntegration)('todo API against a live server', () => {
  beforeAll(() => {
    // apiBaseUrl() reads the env per call, so stubbing here is enough to point
    // every request in this file at the running server.
    if (configuredBaseUrl === '') vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  })

  beforeEach(async () => {
    await removeAll()
  })

  it('starts from an empty collection', async () => {
    await expect(listTodos()).resolves.toEqual([])
  })

  it('creates, lists, updates and deletes a todo end to end', async () => {
    const created = await createTodo('  Buy milk  ')

    // The server assigns the id and trims the title.
    expect(created.title).toBe('Buy milk')
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.completed).toBe(false)
    expect(typeof created.createdAt).toBe('number')

    const listed = await listTodos()
    expect(listed.map((todo) => todo.id)).toEqual([created.id])

    const toggled = await updateTodo(created.id, { completed: true })
    expect(toggled.completed).toBe(true)
    expect(toggled.title).toBe('Buy milk')

    await deleteTodo(created.id)
    await expect(listTodos()).resolves.toEqual([])
  })

  it('keeps a todo across a fresh list request', async () => {
    const created = await createTodo('Survives a reload')

    const reloaded: Todo[] = await listTodos()

    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]?.id).toBe(created.id)
    expect(reloaded[0]?.title).toBe('Survives a reload')
  })

  it('returns the documented envelope for a blank title', async () => {
    const error = (await createTodo('   ').catch((caught: unknown) => caught)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.code).toBe('validation_error')
    expect(error.fieldError('title')).toBeTruthy()
  })

  it('returns a not_found envelope for an unknown id', async () => {
    const error = (await deleteTodo('00000000-0000-4000-8000-000000000000').catch(
      (caught: unknown) => caught,
    )) as ApiError

    expect(error.status).toBe(404)
    expect(error.code).toBe('not_found')
  })

  it('escalates a title over the limit', async () => {
    const error = (await createTodo('x'.repeat(201)).catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(400)
    expect(error.fieldError('title')).toBeTruthy()
  })
})
