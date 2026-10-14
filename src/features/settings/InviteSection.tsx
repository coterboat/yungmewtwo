// "Invite": builds the join link (person + posting key + alert topic) to text to the other person.
import { ChevronDown, ShieldAlert, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, Select, Toggle } from '../../components/ui.tsx'
import { SITE_URL } from '../../lib/config.ts'
import { buildJoinLink, cleanToken, maskJoinLink, tokenLooksRight } from '../../lib/invite.ts'
import { personName, usePeople } from '../../lib/people.ts'
import { usePrefs } from '../../lib/prefs.ts'
import { CheckLine, runCheck, TokenInput } from './KeySection.tsx'
import { CopyButton, ScrollLink, SettingsCard, ShareButton } from './shared.tsx'

function InviteBuilder() {
  const { ntfyTopic, me, anthropicKey } = usePrefs()
  const [shareScan, setShareScan] = useState(true)
  const people = usePeople()
  const others = people.filter((p) => p.id !== me)
  const [personId, setPersonId] = useState((others[0] ?? people[0])?.id ?? '')
  const [input, setInput] = useState('')
  const [check, setCheck] = useState<Awaited<ReturnType<typeof runCheck>>>({ state: 'idle' })
  const key = cleanToken(input)

  // Check the pasted key a moment after typing stops, so a bad one is caught before it's sent.
  useEffect(() => {
    if (key.length < 20) {
      setCheck({ state: 'idle' })
      return
    }
    let live = true
    setCheck({ state: 'checking' })
    const t = setTimeout(() => void runCheck(key).then((c) => live && setCheck(c)), 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [key])

  const scanKey = shareScan && anthropicKey ? anthropicKey : undefined
  const link = useMemo(() => buildJoinLink(SITE_URL, { personId, token: key, topic: ntfyTopic ?? '', scanKey }), [personId, key, ntfyTopic, scanKey])
  const name = personName(people, personId)
  const rejected = check.state === 'bad' && !check.offline
  const ready = !!key && !!personId && !rejected

  return (
    <SettingsCard id="invite" icon={<UserPlus size={18} />} title="Invite" sub="Make a link that sets up someone else's phone: who they are, their posting key and the alert topic.">
      <div className="grid gap-4">
        <Field label="Who is it for?">
          <div className="relative">
            <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" aria-hidden />
          </div>
        </Field>

        <div className="grid gap-2">
          <TokenInput value={input} onChange={setInput} label={`Paste the key made for ${name}`} />
          {key && !tokenLooksRight(key) && check.state === 'idle' && <p className="text-[12.5px] text-ink-3">Keys start with github_pat_. Check you copied the whole thing.</p>}
          <CheckLine check={check} />
          {check.state === 'bad' && check.offline && <p className="text-[12.5px] text-ink-3">You can still copy the link, but the key hasn't been verified.</p>}
        </div>

        <div className="rounded-2xl border border-line bg-surface-2/50 px-4 py-3 text-[13px]">
          {ntfyTopic ? (
            <p className="text-ink-2">
              Alert topic included: <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">{ntfyTopic}</code>
            </p>
          ) : (
            <p className="text-ink-2">
              <span className="font-medium text-ink">No alert topic yet.</span> Set one in{' '}
              <ScrollLink to="alerts">Alerts</ScrollLink>{' '}
              first so {name}'s phone gets alerts too. You can send the link without one.
            </p>
          )}
        </div>

        {anthropicKey && (
          <div className="rounded-2xl border border-line bg-surface-2/50 px-4 py-1">
            <Toggle checked={shareScan} onChange={setShareScan} label={`Let ${name} scan cards with your Claude key`} />
            <p className="pb-2 text-[12px] text-ink-3">Scans bill to your Anthropic account (a few cents per photo). Turn off and they can add their own key.</p>
          </div>
        )}

        {ready ? (
          <div className="grid gap-3">
            <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <div className="mb-1 text-[12px] text-ink-3">The link (key hidden here, included when you copy)</div>
              <p className="font-mono text-[12.5px] leading-relaxed break-all text-ink-2" data-testid="invite-link">
                {maskJoinLink(link)}
              </p>
            </div>
            <div className="flex gap-2">
              <CopyButton text={link} label="Copy link" copiedLabel="Link copied" variant="primary" className="flex-1" />
              <ShareButton title="Join yungmewtwo" text={`${name}, here's your yungmewtwo link. Open it on your phone and it sets itself up:`} url={link} className="flex-1" />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">{rejected ? "GitHub says that key doesn't work, so there's no link yet. Check the key and paste it again." : 'Paste the key above and your link appears here.'}</p>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-line bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-4 py-3 text-[13px] text-ink">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <b>Anyone with this link can post to your repo.</b> Text it straight to {name}. Never put it in a group chat, a social post, or on the Board. If it leaks, delete the key in GitHub and make a new one.
          </p>
        </div>
        <p className="text-[12.5px] text-ink-3">
          Need to make a key first? Open the steps under <ScrollLink to="key">Posting key</ScrollLink>.
        </p>
      </div>
    </SettingsCard>
  )
}

export function InviteSection() {
  const { token } = usePrefs()
  if (!token) return null
  return <InviteBuilder />
}
