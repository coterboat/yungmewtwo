// Weekly reminders (data/user/recurring.json): next start with a countdown, on/off, add/edit/delete.
// The alert engine that actually pushes them to your phone is a separate piece.
import { BellRing, ExternalLink, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast, withToast } from '../../components/toast.tsx'
import { Badge, Button, Card, Empty, Field, Input, Select, Sheet, Skeleton, Textarea, Toggle } from '../../components/ui.tsx'
import { WEEKDAYS_LONG } from '../../lib/hunt.ts'
import { shortHash, slug } from '../../lib/huntOsm.ts'
import { TIMEZONES, draftOf, emptyDraft, nextInfo, scheduleText, sortReminders, toRecurring, validateDraft, type ReminderDraft } from '../../lib/huntReminders.ts'
import type { Recurring } from '../../lib/user.ts'
import { updateUserFile, useUserFile } from '../../lib/userData.ts'
import { KeyNote } from './bits.tsx'
import { useHasKey, type HuntData } from './useHunt.ts'

export function Reminders({ data }: { data: HuntData }) {
  const file = useUserFile<Recurring>('recurring')
  const canPost = useHasKey()
  const { me, now } = data
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)

  const list = file.data ? sortReminders(file.data, now) : undefined

  function toggle(r: Recurring, on: boolean) {
    if (!canPost || !me) {
      toast('Add your posting key in Settings to change reminders.', 'error')
      return
    }
    void withToast(
      () => updateUserFile<Recurring>('recurring', (cur) => cur.map((x) => (x.id === r.id ? { ...x, enabled: on } : x)), `hunt: ${me.name} turned ${on ? 'on' : 'off'} ${r.title}`),
      `${r.title} is ${on ? 'on' : 'off'}`,
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-2">Weekly things worth an alert, like Walmart's Wednesday drawing. Alerts reach your phone through the alerts topic in Settings.</p>
        <Button variant="primary" className="shrink-0" onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden /> New
        </Button>
      </div>

      {!list ? (
        <Skeleton className="h-32" />
      ) : list.length === 0 ? (
        <Empty icon={<BellRing size={20} />} title="No weekly reminders yet" action={<Button variant="primary" onClick={() => setEditing('new')}>Add one</Button>}>
          Add a drawing or a restock day you want an alert for.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((r) => {
            const n = nextInfo(r, now)
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{r.title}</h3>
                    <p className="mt-0.5 text-sm text-ink-2">
                      {scheduleText(r)}
                      {r.durationMin ? ` · about ${r.durationMin} min` : ''}
                    </p>
                  </div>
                  <div className="w-24 shrink-0">
                    <Toggle checked={r.enabled} onChange={(on) => toggle(r, on)} label={<span className="text-[13px] text-ink-2">{r.enabled ? 'On' : 'Off'}</span>} />
                  </div>
                </div>
                {r.enabled ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={n.inProgress ? 'holo' : 'accent'}>{n.inProgress ? 'Happening now' : `in ${n.countdown}`}</Badge>
                    <span className="text-ink-2">Next: {n.label}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-3">Paused. No alerts until you turn it back on.</p>
                )}
                {r.note && <p className="mt-2 text-[13px] text-ink-3">{r.note}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge>{r.alertBefore ? `Alert ${r.alertBefore} min before` : 'Alert at start'}</Badge>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-accent hover:underline">
                      Open page <ExternalLink size={13} aria-hidden />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(r)}>
                    <Pencil size={14} aria-hidden /> Edit
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && <ReminderForm key={editing === 'new' ? 'new' : editing.id} existing={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ReminderForm({ existing, data, onClose }: { existing: Recurring | null; data: HuntData; onClose: () => void }) {
  const canPost = useHasKey()
  const { me } = data
  const [d, setD] = useState<ReminderDraft>(() => (existing ? draftOf(existing) : emptyDraft()))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof ReminderDraft>(k: K, v: ReminderDraft[K]) => setD((cur) => ({ ...cur, [k]: v }))

  function save() {
    const problem = validateDraft(d)
    if (problem) {
      setError(problem)
      return
    }
    if (!canPost || !me) return
    const id = existing?.id ?? `${slug(d.title) || 'reminder'}-${shortHash(d.title + Date.now())}`
    const next = toRecurring(d, id, existing?.enabled ?? true)
    onClose()
    void withToast(
      () =>
        updateUserFile<Recurring>(
          'recurring',
          (cur) => (existing ? cur.map((x) => (x.id === id ? next : x)) : [...cur, next]),
          `hunt: ${me.name} ${existing ? 'edited' : 'added'} reminder ${next.title}`,
        ),
      existing ? 'Reminder saved' : 'Reminder added',
    )
  }

  function remove() {
    if (!existing || !canPost || !me) return
    onClose()
    void withToast(() => updateUserFile<Recurring>('recurring', (cur) => cur.filter((x) => x.id !== existing.id), `hunt: ${me.name} deleted reminder ${existing.title}`), 'Reminder deleted')
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Edit reminder' : 'New weekly reminder'}
      footer={
        <div className="flex items-center gap-2">
          {existing &&
            (confirmDelete ? (
              <>
                <Button variant="danger" onClick={remove}>
                  Yes, delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
          <Button variant="primary" className="ml-auto min-w-28" disabled={!canPost || !me} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <KeyNote canPost={canPost} hasMe={!!me} what="save reminders" />
        <Field label="Title">
          <Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Walmart Collectibles Drawing" maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <Select value={d.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
              {WEEKDAYS_LONG.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time">
            <Input type="time" value={d.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
        </div>
        <Field label="Time zone" hint="The time above is read in this zone, wherever you are.">
          <Select value={d.tz} onChange={(e) => set('tz', e.target.value)}>
            {TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label} ({z.value.replace('_', ' ')})
              </option>
            ))}
            {!TIMEZONES.some((z) => z.value === d.tz) && <option value={d.tz}>{d.tz}</option>}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Alert before (min)" hint="Blank = at start">
            <Input type="number" inputMode="numeric" min={0} value={d.alertBefore} onChange={(e) => set('alertBefore', e.target.value)} />
          </Field>
          <Field label="Lasts (min)" hint="Optional">
            <Input type="number" inputMode="numeric" min={1} value={d.durationMin} onChange={(e) => set('durationMin', e.target.value)} />
          </Field>
        </div>
        <Field label="Link">
          <Input type="url" inputMode="url" value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Note">
          <Textarea rows={2} value={d.note} onChange={(e) => set('note', e.target.value)} maxLength={280} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
