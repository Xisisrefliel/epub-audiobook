const DEEPINFRA_URL = 'https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M'
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

async function handleTts(request: Request) {
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
    if (url.pathname === '/api/tts') return handleTts(request)
    return serveStatic(url.pathname)
  },
})

console.log(`Listening on http://localhost:${server.port}`)
