/**
 * Client tests. These stub `fetch` rather than mocking the module, so the
 * request building, error parsing and shape validation are all really
 * exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiBaseUrl,
  clearCompleted,
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from './todos'

const todo = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Buy milk',
  completed: false,
  createdAt: 1735700000000,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  // Environment stubs are not covered by restoreMocks, and a leaked
  // VITE_API_BASE_URL would silently change every URL asserted below.
  vi.unstubAllEnvs()
  fetchMock.mockReset()
})

function lastCall() {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  const [url, init] = call as [string, RequestInit]
  return { url, init }
}

describe('apiBaseUrl', () => {
  it('defaults to same-origin so the dev proxy handles it', () => {
    expect(apiBaseUrl()).toBe('')
  })

  it('strips a trailing slash from a configured base URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000/')

    expect(apiBaseUrl()).toBe('http://localhost:8000')
  })
})

describe('listTodos', () => {
  it('returns the parsed todos', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([todo]))

    await expect(listTodos()).resolves.toEqual([todo])
  })

  it('requests the collection endpoint with an Accept header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))

    await listTodos()

    const { url, init } = lastCall()
    expect(url).toBe('/api/todos/')
    expect(new Headers(init.headers).get('Accept')).toBe('application/json')
  })

  it('drops rows that do not match the Todo shape', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([todo, { id: '2', title: '', completed: false, createdAt: 1 }, null]),
    )

    await expect(listTodos()).resolves.toEqual([todo])
  })

  it('rejects a payload that is not an array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [todo] }))

    await expect(listTodos()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('createTodo', () => {
  it('posts the title as JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(todo, 201))

    await expect(createTodo('Buy milk')).resolves.toEqual(todo)

    const { url, init } = lastCall()
    expect(url).toBe('/api/todos/')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ title: 'Buy milk' }))
  })
})

describe('updateTodo', () => {
  it('patches a partial body to the detail endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...todo, completed: true }))

    await updateTodo(todo.id, { completed: true })

    const { url, init } = lastCall()
    expect(url).toBe(`/api/todos/${todo.id}/`)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ completed: true }))
  })

  it('escapes the id in the path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(todo))

    await updateTodo('a/b', { completed: true })

    expect(lastCall().url).toBe('/api/todos/a%2Fb/')
  })
})

describe('deleteTodo and clearCompleted', () => {
  it('handles a 204 with no body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deleteTodo(todo.id)).resolves.toBeUndefined()
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('returns the deleted count from the bulk clear', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: 3 }))

    await expect(clearCompleted()).resolves.toBe(3)
    expect(lastCall().url).toBe('/api/todos/completed/')
  })

  it('falls back to zero when the count is missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    await expect(clearCompleted()).resolves.toBe(0)
  })
})

describe('error handling', () => {
  it('parses the documented error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'validation_error', message: 'Validation failed.', fields: { title: ['Title must not be blank.'] } } },
        400,
      ),
    )

    const error = await listTodos().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(400)
    expect(apiError.code).toBe('validation_error')
    expect(apiError.message).toBe('Validation failed.')
    expect(apiError.fieldError('title')).toBe('Title must not be blank.')
    expect(apiError.fieldError('nope')).toBeUndefined()
  })

  it('still produces an ApiError for an HTML error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<!doctype html><title>502</title>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const error = (await listTodos().catch((caught: unknown) => caught)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.code).toBe('unknown_error')
    expect(error.message).toContain('502')
  })

  it('reports a network failure distinctly from an HTTP failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = (await listTodos().catch((caught: unknown) => caught)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.message).toMatch(/could not reach the server/i)
  })
})
