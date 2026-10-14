// Weekday x time-of-day grid for one store. Color is the smoothed chance of stock (one hue,
// light to strong); the number in each square is the plain count (stocked visits / visits), so
// nothing depends on color alone and thin data is visible as thin.
import { useState } from 'react'
import { cx } from '../../components/ui.tsx'
import { BLOCKS, WEEKDAYS_LONG, WEEKDAYS_SHORT, bestWindow, confidence, visitsText, type Cell, type PatternGrid } from '../../lib/hunt.ts'

/** Monday first reads more naturally for a week of store trips. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]

function fill(c: Cell): { background?: string; strong: boolean } {
  if (c.n === 0) return { strong: false }
  const pct = Math.round(12 + Math.min(1, c.mean) * 76)
  return { background: `color-mix(in srgb, var(--accent) ${pct}%, var(--surface-2))`, strong: pct >= 55 }
}

function cellSentence(weekday: number, block: number, c: Cell): string {
  const when = `${WEEKDAYS_LONG[weekday]} ${BLOCKS[block].label.toLowerCase()}`
  if (c.n === 0) return `${when}: no visits logged yet.`
  const conf = confidence(c.n).label.toLowerCase()
  return `${when}: ${visitsText(c.hits, c.n)} had stock (${conf}).`
}

export function HeatGrid({ grid }: { grid: PatternGrid }) {
  const [sel, setSel] = useState<[number, number] | null>(null)
  const best = bestWindow(grid)
  const shown = sel ?? (best ? ([best.weekday, best.block] as [number, number]) : null)

  return (
    <div>
      <div role="grid" aria-label="Stock by weekday and time of day" className="grid grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] gap-[3px]">
        <div role="row" className="contents">
          <span />
          {BLOCKS.map((b) => (
            <span key={b.id} role="columnheader" className="pb-1 text-center text-[11px] leading-tight font-medium text-ink-2">
              {b.label}
              <span className="block font-normal text-ink-3">{b.range}</span>
            </span>
          ))}
        </div>
        {ORDER.map((d) => (
          <div key={d} role="row" className="contents">
            <span role="rowheader" className="flex items-center text-[12px] font-medium text-ink-2">
              {WEEKDAYS_SHORT[d]}
            </span>
            {BLOCKS.map((b, bi) => {
              const c = grid.cells[d][bi]
              const f = fill(c)
              const isBest = best && best.weekday === d && best.block === bi
              const isSel = shown && shown[0] === d && shown[1] === bi
              return (
                <button
                  key={b.id}
                  type="button"
                  role="gridcell"
                  aria-label={cellSentence(d, bi, c)}
                  aria-selected={!!isSel}
                  onClick={() => setSel([d, bi])}
                  onMouseEnter={() => setSel([d, bi])}
                  onFocus={() => setSel([d, bi])}
                  style={f.background ? { background: f.background } : undefined}
                  className={cx(
                    'relative flex min-h-11 items-center justify-center rounded-lg text-[13px] font-semibold tabular transition',
                    c.n === 0 ? 'border border-dashed border-line text-ink-3' : f.strong ? 'text-accent-ink' : 'text-ink',
                    isSel && 'outline-2 outline-offset-1 outline-ink',
                  )}
                >
                  {c.n === 0 ? '·' : `${c.hits}/${c.n}`}
                  {isBest && <span className="absolute top-0.5 right-1 text-[9px] leading-none font-bold" aria-hidden>★</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-10 text-[13px] text-ink-2" aria-live="polite">
        {shown ? cellSentence(shown[0], shown[1], grid.cells[shown[0]][shown[1]]) : 'Tap a square to see its visits.'}
        {!sel && best && ' ★ marks the best window so far.'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span>Less likely</span>
          <span aria-hidden className="h-2.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, var(--surface-2)), color-mix(in srgb, var(--accent) 88%, var(--surface-2)))' }} />
          <span>more likely</span>
        </span>
        <span>Number = visits with stock / visits</span>
        <span>· = no visits yet</span>
      </div>
    </div>
  )
}
