// "Posting key": the GitHub token that lets this phone post, with a numbered guide for making one.
import { CircleCheck, ExternalLink, Eye, EyeOff, KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../components/toast.tsx'
import { Badge, Button, Field, Input } from '../../components/ui.tsx'
import { checkToken } from '../../lib/github.ts'
import { cleanToken, isNetworkProblem, maskToken, tokenLooksRight } from '../../lib/invite.ts'
import { REPO } from '../../lib/config.ts'
import { usePeople } from '../../lib/people.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import { ExternalLinkButton } from '../board/bits.tsx'
import { SettingsCard, StepList } from './shared.tsx'
import { useJoinHint } from '../../lib/people.ts'

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; message: string } | { state: 'bad'; message: string; offline: boolean }

/** Runs checkToken and reports it as a Check. */
export async function runCheck(token: string): Promise<Check> {
  const r = await checkToken(token)
  return r.ok ? { state: 'ok', message: r.message } : { state: 'bad', message: r.message, offline: isNetworkProblem(r.message) }
}

export function CheckLine({ check }: { check: Check }) {
  if (check.state === 'checking')
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-2" role="status">
        <Loader2 size={15} className="animate-spin" aria-hidden /> Checking with GitHub…
      </p>
    )
  if (check.state === 'ok')
    return (
      <p className="flex items-center gap-2 text-[13px] font-medium text-up" role="status">
        <CircleCheck size={16} aria-hidden /> {check.message}
      </p>
    )
  if (check.state === 'bad')
    return (
      <p className="flex items-start gap-2 text-[13px] font-medium text-down" role="alert">
        <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden /> <span>{check.message}</span>
      </p>
    )
  return null
}

export function TokenInput({ value, onChange, placeholder = 'github_pat_…', label = 'Paste the key' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const [show, setShow] = useState(false)
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="pr-12 font-mono text-[14px]"
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'} className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center text-ink-3 hover:text-ink">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </Field>
  )
}

export function KeyGuide({ defaultOpen }: { defaultOpen?: boolean }) {
  const repo = `${REPO.owner}/${REPO.name}`
  const people = usePeople()
  const { me } = usePrefs()
  const example = people.find((p) => p.id !== me)?.name ?? 'Friend'
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-line bg-surface-2/50 px-4 py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-medium">
        How to make a posting key
        <span className="text-[12px] text-ink-3 group-open:hidden">Show steps</span>
        <span className="hidden text-[12px] text-ink-3 group-open:inline">Hide</span>
      </summary>
      <div className="pt-1 pb-3">
        <p className="mb-3 text-[13px] text-ink-2">Whoever owns the repo does this once per person. Each person gets their own key, so one can be switched off without affecting the other.</p>
        <StepList
          steps={[
            <>
              Open <b>github.com/settings/personal-access-tokens/new</b> while signed in to the account that owns the repo.
            </>,
            <>
              <b>Token name:</b> something you'll recognize, like "yungmewtwo - {example}".
            </>,
            <>
              <b>Expiration:</b> pick the longest one allowed.
            </>,
            <>
              <b>Repository access:</b> choose <b>Only select repositories</b>, then pick <b>{repo}</b>.
            </>,
            <>
              <b>Permissions</b>, then <b>Repository permissions</b>, then set <b>Contents</b> to <b>Read and write</b>. Leave everything else alone.
            </>,
            <>
              Tap <b>Generate token</b> and copy it right away. GitHub only shows it once.
            </>,
            <>Paste it here, or into the invite builder below to make a link for the other person.</>,
          ]}
        />
        <div className="mt-3">
          <ExternalLinkButton href="https://github.com/settings/personal-access-tokens/new" variant="secondary" className="w-full sm:w-auto">
            Open GitHub's token page <ExternalLink size={14} aria-hidden />
          </ExternalLinkButton>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">Why one key per person made from the owner's account? GitHub only lets a key cover repos owned by the account that made it, so the other person can't make their own. A key can only touch this one repo's files.</p>
      </div>
    </details>
  )
}

export function KeySection() {
  const { token } = usePrefs()
  const joinHint = useJoinHint()
  const [input, setInput] = useState('')
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)

  // Re-verify the saved key when the page opens, so a revoked or expired one shows up here.
  useEffect(() => {
    if (!token) {
      setCheck({ state: 'idle' })
      return
    }
    let live = true
    setCheck({ state: 'checking' })
    void runCheck(token).then((c) => live && setCheck(c))
    return () => {
      live = false
    }
  }, [token])

  const save = async () => {
    const key = cleanToken(input)
    if (!key) return
    setBusy(true)
    setCheck({ state: 'checking' })
    const result = await runCheck(key)
    setBusy(false)
    if (result.state === 'ok') {
      setPrefs({ token: key })
      setInput('')
      toast('Posting key saved on this device.')
    } else {
      setCheck(result)
    }
  }

  const key = cleanToken(input)
  return (
    <SettingsCard id="key" icon={<KeyRound size={18} />} title="Posting key" sub="A key lets this device post to the board, answer drawings and change names. It's stored only on this device.">
      {token ? (
        <div className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good" icon={<CircleCheck size={12} aria-hidden />}>
              Key saved
            </Badge>
            <code className="font-mono text-[13px] text-ink-2">{maskToken(token)}</code>
          </div>
          <CheckLine check={check} />
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" className="!min-h-11" onClick={() => void runCheck(token).then(setCheck)} disabled={check.state === 'checking'}>
              Check again
            </Button>
            {confirmRemove ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  className="!min-h-11"
                  onClick={() => {
                    setPrefs({ token: null })
                    setConfirmRemove(false)
                    toast('Posting key removed from this device.')
                  }}
                >
                  Yes, remove it
                </Button>
                <Button size="sm" className="!min-h-11" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" className="!min-h-11" onClick={() => setConfirmRemove(true)}>
                Remove key
              </Button>
            )}
          </div>
          {confirmRemove && <p className="text-[12.5px] text-ink-3">You'll be read-only until you add one again. Removing it here doesn't switch the key off at GitHub.</p>}
        </div>
      ) : (
        <p className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-[13.5px] text-ink-2">
          <span className="font-medium text-ink">No key on this device yet.</span> You can read everything, but not post. {joinHint}
        </p>
      )}

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TokenInput value={input} onChange={setInput} label={token ? 'Replace with a new key' : 'Paste a key'} />
        {key && !tokenLooksRight(key) && <p className="-mt-1 text-[12.5px] text-ink-3">That doesn't look like a GitHub key (they start with github_pat_). We'll still check it with GitHub.</p>}
        {!token && <CheckLine check={check} />}
        {token && check.state === 'bad' && input && <CheckLine check={check} />}
        <Button type="submit" variant="primary" disabled={!key || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {busy ? 'Checking…' : 'Check and save key'}
        </Button>
      </form>

      <div className="mt-4">
        <KeyGuide defaultOpen={false} />
      </div>
    </SettingsCard>
  )
}
