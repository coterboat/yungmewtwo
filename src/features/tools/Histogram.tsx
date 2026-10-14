// Distribution of simulated outcomes: bars for how many runs landed at each value, with the
// median, the average and the price paid marked. Markers differ by dash style as well as color.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { money } from '../../lib/format.ts'
import { histogram, percentile } from '../../lib/evSim.ts'

export interface Marker {
  key: string
  label: string
  value: number
  dash?: string
  color: string
}

const H = 170
const PAD = { top: 8, right: 6, bottom: 24, left: 6 }

export function Histogram({ values, markers, paid, ariaLabel }: { values: Float64Array; markers: Marker[]; paid: number | null; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { bins, hi, max } = useMemo(() => {
    const top = Math.max(percentile(values, 0.98), (values[0] ?? 0) + 1)
    const h = histogram(values, 40, 0, top)
    return { bins: h.bins, hi: top, max: h.max }
  }, [values])

  const iw = width - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (v: number) => PAD.left + Math.min(1, Math.max(0, v / hi)) * iw
  const bw = iw / bins.length
  const ticks = [0, hi / 2, hi]

  return (
    <div ref={wrap}>
      <svg width={width} height={H} role="img" aria-label={ariaLabel} className="block overflow-visible">
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="var(--axis)" strokeWidth={1} />
        {bins.map((b, i) => {
          const h = (b.count / max) * ih
          const profit = paid != null && b.hi > paid
          return <rect key={i} x={PAD.left + i * bw + 0.5} y={PAD.top + ih - h} width={Math.max(1, bw - 1)} height={h} rx={1.5} fill="var(--series-market)" opacity={paid == null || profit ? 0.95 : 0.4} />
        })}
        {markers.map((m) => (
          <line key={m.key} x1={x(m.value)} x2={x(m.value)} y1={PAD.top} y2={PAD.top + ih} stroke={m.color} strokeWidth={2} strokeDasharray={m.dash} />
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="fill-ink-3 tabular" fontSize={11}>
            {money(t, { compact: true })}
            {i === 2 ? '+' : ''}
          </text>
        ))}
      </svg>
    </div>
  )
}
