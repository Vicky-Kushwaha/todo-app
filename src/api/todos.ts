/**
 * Typed client for the todo REST API.
 *
 * This is the only module that knows about HTTP. Everything above it works with
 * `Todo` and throws `ApiError`, so a change to the transport (auth headers,
 * retries, a different base URL) stays in one place.
 *
 * The server is the source of truth: no localStorage fallback, no shadow copy.
 */

import { type Todo } from '../types'

/** The `error` object the API returns for every 4xx/5xx. */
export type ApiErrorBody = {
  code: string
  message: string
  fields?: Record<string, string[]>
}

/**
 * A failed request, carrying enough detail for the UI to say something useful.
 *
 * `fields` is only present for validation failures, which is what lets a form
 * point at the offending input instead of showing a generic banner.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string[]>

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  /** First server-side message for a field, if the failure named one. */
  fieldError(field: string): string | undefined {
    return this.fields?.[field]?.[0]
  }
}

/**
 * Base URL for API calls.
 *
 * Read per call rather than frozen at import time so tests can change it.
 * Defaults to "" (same origin), which is what the Vite dev proxy expects; set
 * `VITE_API_BASE_URL` when the API lives on another origin.
 */
export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  return typeof configured === 'string' ? configured.replace(/\/+$/, '') : ''
}

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    candidate.title.trim() !== '' &&
    typeof candidate.completed === 'boolean' &&
    typeof candidate.createdAt === 'number'
  )
}

function asFields(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const fields: Record<string, string[]> = {}
  for (const [key, messages] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      fields[key] = messages.map((message) => String(message))
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined
}

/** Turn a non-OK response into an ApiError, tolerating a non-conforming body. */
function toApiError(response: Response, body: unknown): ApiError {
  const envelope = (body as { error?: unknown } | null)?.error

  if (typeof envelope === 'object' && envelope !== null) {
    const { code, message, fields } = envelope as Partial<ApiErrorBody>
    return new ApiError(
      response.status,
      typeof code === 'string' ? code : 'unknown_error',
      typeof message === 'string' && message !== ''
        ? message
        : `Request failed with status ${response.status}.`,
      asFields(fields),
    )
  }

  return new ApiError(
    response.status,
    'unknown_error',
    `Request failed with status ${response.status}.`,
  )
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers })
  } catch {
    // fetch only rejects when the request never completed: DNS, offline,
    // server down, or a CORS preflight refusal.
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
    )
  }

  if (response.status === 204) return null

  const text = await response.text()
  let body: unknown = null
  if (text !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      // A proxy or gateway can return HTML; treat it as an unreadable body
      // rather than letting a parse error escape as a crash.
      body = null
    }
  }

  if (!response.ok) throw toApiError(response, body)

  return body
}

function requireTodo(value: unknown): Todo {
  if (!isTodo(value)) {
    throw new ApiError(200, 'invalid_response', 'The server returned an unexpected response.')
  }
  return value
}

/** GET /api/todos/ - all todos, newest first. */
export async function listTodos(): Promise<Todo[]> {
  const body = await request('/api/todos/')

  if (!Array.isArray(body)) {
    throw new ApiError(200, 'invalid_response', 'The server returned an unexpected response.')
  }

  // Tolerate a malformed row rather than failing the whole screen; the server
  // owns the shape, so a bad row is a bug to notice, not a reason to blank out.
  return body.filter(isTodo)
}

/** POST /api/todos/ */
export async function createTodo(title: string): Promise<Todo> {
  const body = await request('/api/todos/', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })

  return requireTodo(body)
}

/** PATCH /api/todos/{id}/ - partial update; only the given fields change. */
export async function updateTodo(
  id: string,
  patch: { title?: string; completed?: boolean },
): Promise<Todo> {
  const body = await request(`/api/todos/${encodeURIComponent(id)}/`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

  return requireTodo(body)
}

/** DELETE /api/todos/{id}/ */
export async function deleteTodo(id: string): Promise<void> {
  await request(`/api/todos/${encodeURIComponent(id)}/`, { method: 'DELETE' })
}

/** DELETE /api/todos/completed/ - returns how many rows were removed. */
export async function clearCompleted(): Promise<number> {
  const body = await request('/api/todos/completed/', { method: 'DELETE' })
  const deleted = (body as { deleted?: unknown } | null)?.deleted

  return typeof deleted === 'number' ? deleted : 0
}
