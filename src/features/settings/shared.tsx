// Pieces shared by Settings and the Join page: section cards, copy and share buttons, and the
// "get phone alerts" steps.
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from '../../components/toast.tsx'
import { Button, Card, cx } from '../../components/ui.tsx'
import { NTFY_ANDROID, NTFY_IOS, topicWebUrl } from '../../lib/ntfySetup.ts'
import { ExternalLinkButton } from '../board/bits.tsx'

/** Copies text; falls back to a hidden textarea where the async clipboard isn't allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied', what, variant = 'secondary', className, disabled }: { text: string; label?: string; copiedLabel?: string; what?: string; variant?: 'primary' | 'secondary' | 'ghost'; className?: string; disabled?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant={variant}
      className={className}
      disabled={disabled}
      onClick={async () => {
        const ok = await copyText(text)
        if (!ok) return toast("Couldn't copy. Press and hold the text to copy it instead.", 'error')
        setDone(true)
        if (what) toast(`${what} copied.`)
        setTimeout(() => setDone(false), 2200)
      }}
    >
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {done ? copiedLabel : label}
    </Button>
  )
}

export function ShareButton({ title, text, url, className, disabled }: { title: string; text: string; url: string; className?: string; disabled?: boolean }) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return null
  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.share({ title, text, url })
        } catch (err) {
          // Closing the share sheet throws AbortError; that's not a failure.
          if ((err as Error).name !== 'AbortError') toast("Couldn't open the share sheet. Use Copy instead.", 'error')
        }
      }}
    >
      <Share2 size={16} aria-hidden /> Share
    </Button>
  )
}

/** A text button that scrolls to a section on this page (real #links would fight the hash router). */
export function ScrollLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="font-medium text-accent underline underline-offset-2">
      {children}
    </button>
  )
}

export function SettingsCard({ id, icon, title, sub, children, className }: { id?: string; icon: ReactNode; title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div id={id} className="scroll-mt-20">
      <Card className={cx('p-5', className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
        </div>
      </div>
        {children}
      </Card>
    </div>
  )
}

export function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="grid gap-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-[14px]">
          <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-bold text-ink-2" aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5 text-ink-2 [overflow-wrap:anywhere] [&_b]:font-semibold [&_b]:text-ink">{s}</span>
        </li>
      ))}
    </ol>
  )
}

/** Install ntfy and subscribe to the topic: app links, the steps, a copy button and the web link. */
export function NtfySteps({ topic }: { topic: string }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <ExternalLinkButton href={NTFY_IOS}>
          iPhone app <ExternalLink size={14} aria-hidden />
        </ExternalLinkButton>
        <ExternalLinkButton href={NTFY_ANDROID}>
          Android app <ExternalLink size={14} aria-hidden />
        </ExternalLinkButton>
      </div>
      <StepList
        steps={[
          <>
            Install the free <b>ntfy</b> app (buttons above) and open it.
          </>,
          <>
            Tap the <b>+</b> button.
          </>,
          <>
            Paste this as the topic: <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[13px] text-ink">{topic}</code>
          </>,
          <>
            Leave the server as <b>ntfy.sh</b> and tap <b>Subscribe</b>.
          </>,
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CopyButton text={topic} label="Copy topic" copiedLabel="Topic copied" />
        <a href={topicWebUrl(topic)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-medium text-accent underline underline-offset-2">
          Or watch it in a browser <ExternalLink size={13} aria-hidden />
        </a>
      </div>
    </div>
  )
}
