import { describe, expect, it } from 'vitest'
import { applyPersonEdit, inkFor, validatePerson } from './peopleEdit.ts'
import type { Person } from './user.ts'

const DEFAULTS: Person[] = [
  { id: 'alex', name: 'Alex', area: 'Sandy Springs, GA', color: '#a78bfa' },
  { id: 'paul', name: 'Paul', area: 'Simpsonville, SC', color: '#f5a524' },
]

describe('validatePerson', () => {
  it('needs a name and a hex color', () => {
    expect(validatePerson({ name: ' ', area: '', color: '#a78bfa' }).name).toBeTruthy()
    expect(validatePerson({ name: 'Sam', area: '', color: 'purple' }).color).toBeTruthy()
    expect(validatePerson({ name: 'Sam', area: 'Atlanta, GA', color: '#A78BFA' })).toEqual({})
  })
  it('keeps names short and ZIP codes out of the public repo', () => {
    expect(validatePerson({ name: 'x'.repeat(31), area: '', color: '#a78bfa' }).name).toBeTruthy()
    expect(validatePerson({ name: 'Sam', area: 'Atlanta, GA 30328', color: '#a78bfa' }).area).toMatch(/zip/i)
    expect(validatePerson({ name: 'Sam', area: '30328', color: '#a78bfa' }).area).toMatch(/zip/i)
  })
})

describe('applyPersonEdit', () => {
  it('renames one person and leaves the rest, keeping ids', () => {
    const next = applyPersonEdit(DEFAULTS, { id: 'paul', name: ' Jordan ', area: ' Simpsonville, SC ', color: '#22c55e' })
    expect(next).toEqual([DEFAULTS[0], { id: 'paul', name: 'Jordan', area: 'Simpsonville, SC', color: '#22c55e' }])
    expect(DEFAULTS[1].name).toBe('Paul')
  })
  it('starts from the defaults when the file is empty', () => {
    const next = applyPersonEdit([], { id: 'paul', name: 'Jordan', area: 'x', color: '#22c55e' }, DEFAULTS)
    expect(next.map((p) => p.id)).toEqual(['alex', 'paul'])
    expect(next[1].name).toBe('Jordan')
  })
  it('adds a person it has not seen', () => {
    const next = applyPersonEdit(DEFAULTS, { id: 'sam', name: 'Sam', area: '', color: '#22c55e' })
    expect(next.map((p) => p.id)).toEqual(['alex', 'paul', 'sam'])
  })
})

describe('inkFor', () => {
  it('uses dark text on light colors and light text on dark ones', () => {
    expect(inkFor('#fde68a')).toBe('#0b0a10')
    expect(inkFor('#1e3a8a')).toBe('#ffffff')
  })
})
