// Tiny toast system: toast('Posted!') from anywhere; <Toaster/> renders them.
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cx } from './ui.tsx'

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let nextId = 1

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const t = { id: nextId++, text, tone }
  toasts = [...toasts, t]
  listeners.forEach((l) => l())
  setTimeout(
    () => {
      toasts = toasts.filter((x) => x.id !== t.id)
      listeners.forEach((l) => l())
    },
    tone === 'error' ? 7000 : 3200,
  )
}

/** Runs an async action and toasts its outcome. */
export async function withToast(action: () => Promise<unknown>, ok: string): Promise<boolean> {
  try {
    await action()
    toast(ok)
    return true
  } catch (err) {
    toast((err as Error).message, 'error')
    return false
  }
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'fade-in pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl border px-4 py-3 text-sm shadow-2xl',
            t.tone === 'ok' ? 'border-line bg-surface-3 text-ink' : 'border-down/50 bg-surface-3 text-ink',
          )}
        >
          {t.tone === 'ok' ? <CheckCircle2 size={18} className="mt-px shrink-0 text-up" /> : <AlertTriangle size={18} className="mt-px shrink-0 text-down" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
