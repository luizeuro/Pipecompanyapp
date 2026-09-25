// Chamada única à API: trata JSON, erro e sessão expirada num lugar só,
// pra nenhuma página precisar repetir esse código.

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

let onUnauthorized = null

// O App registra aqui o que fazer quando a sessão expira (voltar pro login).
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('Sem conexão com o servidor. Confira sua internet.', 0, 'NETWORK')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized()
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, res.status, data.code)
  return data
}
