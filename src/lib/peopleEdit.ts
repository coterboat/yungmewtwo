// Editing the people in people.json (names, rough area, accent color) from Settings.
import type { Person } from './user.ts'

export const COLOR_CHOICES = ['#a78bfa', '#f5a524', '#38bdf8', '#34d399', '#f472b6', '#fb7185', '#facc15', '#94a3b8']

export type PersonErrors = Partial<Record<'name' | 'area' | 'color', string>>

export function validatePerson(p: Pick<Person, 'name' | 'area' | 'color'>): PersonErrors {
  const errors: PersonErrors = {}
  const name = p.name.trim()
  if (!name) errors.name = 'Add a name.'
  else if (name.length > 30) errors.name = 'Keep it under 30 characters.'
  if (/\b\d{5}(?:-\d{4})?\b/.test(p.area)) errors.area = 'Leave the ZIP code out: this repo is public. City and state is plenty.'
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) errors.color = 'Pick a color.'
  return errors
}

/** Returns the people list with one person's details replaced (or added). Ids never change.
 *  An empty file starts from `fallback`, the built-in defaults. */
export function applyPersonEdit(current: Person[], edit: Person, fallback: Person[] = []): Person[] {
  const base = current.length ? current : fallback
  const clean: Person = { id: edit.id, name: edit.name.trim(), area: edit.area.trim(), color: edit.color }
  return base.some((p) => p.id === edit.id) ? base.map((p) => (p.id === edit.id ? clean : p)) : [...base, clean]
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Text color that stays readable on a person's accent color. */
export function inkFor(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#0b0a10'
  const l = luminance(hex)
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.053 ? '#ffffff' : '#0b0a10'
}
