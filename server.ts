const DEEPINFRA_URL = 'https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M'
const AUTH_COOKIE = 'audiobook_auth'
const distDir = new URL('./dist/', import.meta.url)

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

function getInviteCode() {
  return Bun.env.INVITE_CODE?.trim()
}

function parseCookies(request: Request) {
  const cookies: Record<string, string> = {}
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, value] = part.trim().split('=')
    if (key && value) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function isAuthenticated(request: Request) {
  const inviteCode = getInviteCode()
  if (!inviteCode) return true
  return parseCookies(request)[AUTH_COOKIE] === inviteCode
}

function authCookie(value: string, maxAge: number) {
  const secure = Bun.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${AUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

async function handleAuth(request: Request, pathname: string) {
  if (pathname === '/api/auth/status') {
    return jsonResponse({ authenticated: isAuthenticated(request), required: !!getInviteCode() })
  }

  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
    const inviteCode = getInviteCode()
    if (!inviteCode) return jsonResponse({ authenticated: true, required: false })

    let body: { code?: string }
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.code?.trim() !== inviteCode) {
      return jsonResponse({ error: 'Invalid invite code' }, { status: 401 })
    }

    return jsonResponse(
      { authenticated: true },
      { headers: { 'Set-Cookie': authCookie(inviteCode, 60 * 60 * 24 * 30) } },
    )
  }

  if (pathname === '/api/auth/logout') {
    return jsonResponse({ authenticated: false }, { headers: { 'Set-Cookie': authCookie('', 0) } })
  }

  return jsonResponse({ error: 'Not found' }, { status: 404 })
}

async function handleTts(request: Request) {
  if (!isAuthenticated(request)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const apiKey = Bun.env.DEEPINFRA_API_KEY
  if (!apiKey) {
    return jsonResponse({ error: 'Missing server env var DEEPINFRA_API_KEY' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const response = await fetch(DEEPINFRA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  })
}

async function serveStatic(pathname: string) {
  const path = pathname === '/' ? 'index.html' : pathname.slice(1)
  const file = Bun.file(new URL(path, distDir))
  if (await file.exists()) return new Response(file)
  return new Response(Bun.file(new URL('index.html', distDir)))
}

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/auth/')) return handleAuth(request, url.pathname)
    if (url.pathname === '/api/tts') return handleTts(request)
    return serveStatic(url.pathname)
  },
})

console.log(`Listening on http://localhost:${server.port}`)
