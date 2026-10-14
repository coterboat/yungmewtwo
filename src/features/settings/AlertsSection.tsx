// "Alerts": the ntfy topic this device listens to, how to subscribe on a phone, and a test alert.
import { Bell, BellRing, Dices, Loader2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../components/toast.tsx'
import { Button, Field, Input } from '../../components/ui.tsx'
import { cleanTopic, generateTopic, isValidTopic, sendTestAlert } from '../../lib/ntfySetup.ts'
import { personName, usePeople } from '../../lib/people.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import { NtfySteps, SettingsCard } from './shared.tsx'

const GETS = [
  ['Price targets', 'When something on your watchlist hits the price you set.'],
  ['Drawings closing', 'A heads-up before a drawing on the Board runs out of time.'],
  ['Drops going live', 'Before a restock or pre-order you posted or saved goes live.'],
  ['New posts', 'When the other person puts a deal, drawing or drop on the Board.'],
  ['Restock patterns', "A nudge when a store's restock history says today is the day. This needs a few sightings logged first."],
]

export function AlertsSection() {
  const { ntfyTopic, me } = usePrefs()
  const people = usePeople()
  const [input, setInput] = useState(ntfyTopic ?? '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | undefined>()
  // A join link can fill the topic while this page is open.
  useEffect(() => setInput(ntfyTopic ?? ''), [ntfyTopic])

  const cleaned = cleanTopic(input)
  const typed = input.trim().length > 0
  const invalid = typed && !cleaned
  const dirty = cleaned !== (ntfyTopic ?? '') && !(invalid && !ntfyTopic)

  const save = () => {
    if (invalid) return
    setPrefs({ ntfyTopic: cleaned || null })
    toast(cleaned ? 'Alert topic saved on this device.' : 'Alerts turned off on this device.')
  }

  const test = async () => {
    if (!ntfyTopic) return
    setSending(true)
    setSent(undefined)
    try {
      await sendTestAlert(ntfyTopic, personName(people, me ?? undefined))
      setSent('Sent. If you subscribed in the ntfy app, your phone should buzz within a few seconds.')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <SettingsCard id="alerts" icon={<BellRing size={18} />} title="Alerts" sub="Phone alerts come through ntfy, a free app. No account needed.">
      <div className="grid gap-4">
        <div>
          <Field label="Alert topic" hint="Like a private channel name. Anyone who knows it can read your alerts, so keep it long and random.">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="yungmewtwo-…" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="font-mono text-[14px]" aria-invalid={invalid} />
          </Field>
          {invalid && <p className="mt-1.5 text-[12.5px] font-medium text-down">Topics can only use letters, numbers, dashes and underscores.</p>}
          {cleaned && !isValidTopic(cleaned) && <p className="mt-1.5 text-[12.5px] text-ink-3">That's short enough to guess. A longer one keeps strangers out of your alerts.</p>}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!dirty} onClick={save}>
              {cleaned || !ntfyTopic ? 'Save topic' : 'Turn alerts off'}
            </Button>
            <Button onClick={() => setInput(generateTopic())}>
              <Dices size={16} aria-hidden /> Make a private topic
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-3">Alerts only reach you when the repo's alert job publishes to this same topic, so use the one Alex gave you, or make one and tell Alex.</p>
        </div>

        {ntfyTopic && (
          <>
            <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
              <h3 className="mb-3 text-[14px] font-semibold">Subscribe on this phone</h3>
              <NtfySteps topic={ntfyTopic} />
            </div>
            <div>
              <Button onClick={test} disabled={sending}>
                {sending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
                {sending ? 'Sending…' : 'Send a test alert'}
              </Button>
              {sent && (
                <p className="mt-2 text-[13px] text-ink-2" role="status">
                  {sent}
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
            <Bell size={15} aria-hidden /> What you can get
          </h3>
          <ul className="grid gap-2">
            {GETS.map(([t, d]) => (
              <li key={t} className="text-[13.5px] text-ink-2">
                <span className="font-medium text-ink">{t}.</span> {d}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-ink-3">A background job checks roughly every half hour, so alerts can lag a little and aren't instant. Nothing fires until there's something to fire on: set a price target, post a drawing, and so on.</p>
        </div>
      </div>
    </SettingsCard>
  )
}
