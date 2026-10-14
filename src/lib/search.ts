// Product search over the index files: every query word must match the name, set, number or
// rarity; ranking favors name hits, then price (collectors usually want the valuable printing).
import type { IndexRow, SetSummary } from './site.ts'

export interface SearchHit {
  row: IndexRow
  score: number
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/ ]+/g, ' ')

export function searchIndex(rows: IndexRow[], query: string, sets: Map<number, SetSummary> | undefined, opts: { kind?: 'c' | 's'; limit?: number } = {}): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: SearchHit[] = []
  for (const row of rows) {
    if (opts.kind && row[3] !== opts.kind) continue
    const name = norm(row[1])
    const set = sets?.get(row[2])
    const hay = `${name} ${set ? norm(`${set.name} ${set.abbr}`) : ''} ${row[4].toLowerCase()} ${norm(row[5])}`
    let score = 0
    let ok = true
    for (const w of words) {
      const i = hay.indexOf(w)
      if (i < 0) {
        ok = false
        break
      }
      score += i < name.length ? (name.startsWith(w) ? 6 : 4) : 1
    }
    if (!ok) continue
    score += Math.log10((row[7] ?? 0) + 1) * 1.5
    hits.push({ row, score })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, opts.limit ?? 60)
}
