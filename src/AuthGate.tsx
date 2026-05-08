import { useEffect, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import App from './App'

type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

export function AuthGate() {
  const [state, setState] = useState<AuthState>('checking')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/status')
      .then((response) => response.json() as Promise<{ authenticated: boolean; required: boolean }>)
      .then((status) => {
        if (cancelled) return
        setState(status.authenticated || !status.required ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        if (!cancelled) setState('unauthenticated')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!response.ok) {
        setError('That invite code is not valid.')
        return
      }
      setState('authenticated')
    } catch {
      setError('Could not verify the invite code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (state === 'authenticated') return <App />

  return (
    <div className="grid min-h-screen place-items-center bg-white px-6 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white/90 p-6 shadow-xl shadow-zinc-900/5 ring-1 ring-black/[0.02] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/30 dark:ring-white/[0.04]"
      >
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          <LockKeyhole className="size-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Enter invite code</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          This audiobook reader is private for now. Use your invite code to continue.
        </p>

        <label className="mt-6 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="invite-code">
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none transition-[border-color,box-shadow] duration-150 focus:border-zinc-400 focus:shadow-[0_0_0_3px_rgba(113,113,122,0.12)] dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
          placeholder="••••••••"
        />
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="mt-6 h-11 w-full rounded-xl bg-zinc-900 text-sm font-semibold text-white transition-[transform,opacity] duration-150 ease-(--ease-out-strong) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitting ? 'Checking…' : state === 'checking' ? 'Loading…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
