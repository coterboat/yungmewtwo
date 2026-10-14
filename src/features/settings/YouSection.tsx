// "You": who's viewing on this device, and editing the names, areas and colors in people.json.
import { Check, Loader2, Palette, UserRound } from 'lucide-react'
import { useState } from 'react'
import { withToast } from '../../components/toast.tsx'
import { Button, Field, Input, cx } from '../../components/ui.tsx'
import { DEFAULT_PEOPLE, usePeople } from '../../lib/people.ts'
import { applyPersonEdit, COLOR_CHOICES, inkFor, validatePerson } from '../../lib/peopleEdit.ts'
import { setPrefs, usePrefs } from '../../lib/prefs.ts'
import type { Person } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'
import { Avatar, NeedKeyNote } from '../board/bits.tsx'
import { SettingsCard } from './shared.tsx'

function PersonEditor({ person, canSave, editorName }: { person: Person; canSave: boolean; editorName: string }) {
  const [name, setName] = useState(person.name)
  const [area, setArea] = useState(person.area)
  const [color, setColor] = useState(person.color)
  const [busy, setBusy] = useState(false)
  const errors = validatePerson({ name, area, color })
  const changed = name.trim() !== person.name || area.trim() !== person.area || color.toLowerCase() !== person.color.toLowerCase()
  const bad = Object.keys(errors).length > 0
  const preview: Person = { ...person, name: name.trim() || person.name, color: /^#[0-9a-f]{6}$/i.test(color) ? color : person.color }

  const save = async () => {
    if (bad || !changed) return
    setBusy(true)
    const edit: Person = { id: person.id, name, area, color }
    const renamed = name.trim() !== person.name
    await withToast(
      () =>
        updateUserFile<Person>('people', (items) => applyPersonEdit(items, edit, DEFAULT_PEOPLE), renamed ? `people: ${editorName} renamed ${person.name} to ${name.trim()}` : `people: ${editorName} updated ${person.name}'s details`),
      'Saved. Everyone will see the new details.',
    )
    setBusy(false)
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/50 p-4">
      <div className="flex items-center gap-3">
        <Avatar person={preview} size={36} />
        <div className="min-w-0 text-[14px] font-semibold">{preview.name}</div>
      </div>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-invalid={!!errors.name} />
      </Field>
      {errors.name && <p className="-mt-2 text-[12.5px] font-medium text-down">{errors.name}</p>}
      <Field label="Area" hint="A rough area, like a city and state. No ZIP codes: this repo is public.">
        <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={60} aria-invalid={!!errors.area} />
      </Field>
      {errors.area && <p className="-mt-2 text-[12.5px] font-medium text-down">{errors.area}</p>}
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-2">Color</div>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`Color for ${preview.name}`}>
          {COLOR_CHOICES.map((c) => {
            const on = c.toLowerCase() === color.toLowerCase()
            return (
              <button key={c} type="button" role="radio" aria-checked={on} aria-label={c} onClick={() => setColor(c)} className="flex h-11 w-11 items-center justify-center rounded-full">
                <span className={cx('flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition', on && 'ring-2 ring-ink')} style={{ background: c, color: inkFor(c) }}>
                  {on && <Check size={16} aria-hidden />}
                </span>
              </button>
            )
          })}
          <label className="flex h-11 min-w-11 cursor-pointer items-center gap-2 rounded-full px-2 text-[13px] text-ink-2">
            <Palette size={16} aria-hidden />
            Custom
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#a78bfa'} onChange={(e) => setColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded-md border border-line bg-transparent p-0" />
          </label>
        </div>
      </div>
      <Button variant="primary" disabled={!canSave || bad || !changed || busy} onClick={save}>
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  )
}

export function YouSection() {
  const people = usePeople()
  const { me, token } = usePrefs()
  const [editing, setEditing] = useState(false)
  const editor = people.find((p) => p.id === me)?.name ?? 'Someone'
  return (
    <SettingsCard icon={<UserRound size={18} />} title="You" sub="Who's using this device. It decides whose watchlist and vault you see, and who your posts come from.">
      <div className="grid gap-2" role="radiogroup" aria-label="Who's looking?">
        {people.map((p) => {
          const on = me === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPrefs({ me: p.id })}
              className={cx('flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong')}
            >
              <Avatar person={p} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block truncate text-[12px] text-ink-3">{p.area}</span>
              </span>
              {on && (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
                  <Check size={15} aria-hidden /> This device
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <Button variant="ghost" className="-ml-3" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit names and colors'}
        </Button>
        {editing && (
          <div className="fade-in mt-2 grid gap-3">
            {!token && <NeedKeyNote what="change names" />}
            {people.map((p) => (
              <PersonEditor key={`${p.id}|${p.name}|${p.area}|${p.color}`} person={p} canSave={!!token} editorName={editor} />
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  )
}
