// Price-over-time line chart (inline SVG). Crosshair snaps to the nearest day and one tooltip
// lists every series there. Follows the dataviz specs: 2px lines, hairline grid, 10% area wash
// on a single series, legend for 2+ series, end-dot with a surface ring.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { money, shortDate } from '../lib/format.ts'

export interface ChartSeries {
  key: string
  label: string
  /** CSS color, normally a var(--series-*) token. */
  color: string
  values: Array<number | null>
}

const PAD = { top: 12, right: 12, bottom: 24, left: 44 }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1)
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

export function PriceChart({ dates, series, height = 220 }: { dates: string[]; series: ChartSeries[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { ticks, x, y, paths } = useMemo(() => {
    const vals = series.flatMap((s) => s.values.filter((v): v is number => v != null))
    const ticks = niceTicks(Math.min(...vals, Infinity) === Infinity ? 0 : Math.min(...vals), vals.length ? Math.max(...vals) : 1)
    const lo = ticks[0]
    const hi = ticks[ticks.length - 1]
    const iw = width - PAD.left - PAD.right
    const ih = height - PAD.top - PAD.bottom
    const x = (i: number) => PAD.left + (dates.length <= 1 ? iw / 2 : (i / (dates.length - 1)) * iw)
    const y = (v: number) => PAD.top + ih - ((v - lo) / (hi - lo || 1)) * ih
    const paths = series.map((s) => {
      let d = ''
      let pen = false
      s.values.forEach((v, i) => {
        if (v == null) {
          pen = false
          return
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        pen = true
      })
      const pts = s.values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null)
      const area = pts.length > 1 ? `M${x(pts[0][0])},${y(lo)}${pts.map(([i, v]) => `L${x(i)},${y(v)}`).join('')}L${x(pts[pts.length - 1][0])},${y(lo)}Z` : ''
      const last = pts[pts.length - 1]
      return { s, d, area, last }
    })
    return { ticks, x, y, paths }
  }, [series, dates, width, height])

  const onMove = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect()
    if (!rect || !dates.length) return
    const iw = width - PAD.left - PAD.right
    const rel = (clientX - rect.left - PAD.left) / (iw || 1)
    setHover(Math.max(0, Math.min(dates.length - 1, Math.round(rel * (dates.length - 1)))))
  }

  const tipLeft = hover != null ? Math.min(Math.max(x(hover) - 70, 4), width - 148) : 0

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrap}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={height} role="img" aria-label="Price history chart" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 tabular" fontSize={11}>
                {money(t, { compact: true })}
              </text>
            </g>
          ))}
          {dates.length > 0 && (
            <>
              <text x={PAD.left} y={height - 6} className="fill-ink-3" fontSize={11}>
                {shortDate(dates[0])}
              </text>
              {dates.length > 1 && (
                <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-ink-3" fontSize={11}>
                  {shortDate(dates[dates.length - 1])}
                </text>
              )}
            </>
          )}
          {series.length === 1 && paths[0]?.area && <path d={paths[0].area} fill={paths[0].s.color} opacity={0.1} />}
          {paths.map(({ s, d }) => (
            <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {paths.map(({ s, last }) => last && <circle key={s.key} cx={x(last[0])} cy={y(last[1])} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />)}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--axis)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover]
                return v == null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              })}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-1 w-36 rounded-xl border border-line bg-surface-3 px-3 py-2 text-[12px] shadow-xl" style={{ left: tipLeft }}>
            <div className="mb-1 text-ink-3">{shortDate(dates[hover])}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-ink tabular">{money(s.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Tiny trend line for rows and tiles; no axes, no hover. */
export function Sparkline({ values, width = 72, height = 24, color = 'var(--series-market)' }: { values: Array<number | null>; width?: number; height?: number; color?: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null)
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden />
  const vs = pts.map((p) => p[1])
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const n = values.length - 1 || 1
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${((i / n) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
