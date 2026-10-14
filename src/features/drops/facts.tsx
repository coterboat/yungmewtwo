// The pre-order, prerelease and Japan-to-English lines shared by the hero and the release cards.
import { ArrowRightLeft, CalendarCheck, Hourglass, Ticket } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui.tsx'
import { preorderStatus, shortName, type DropRelease } from '../../lib/drops.ts'
import { daysUntil, relDays, shortDate, weekday } from '../../lib/format.ts'
import { Fact } from './bits.tsx'
import { rangeText } from './util.ts'

const Muted = ({ children }: { children: ReactNode }) => <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{children}</div>

export function PrereleaseFact({ r, today }: { r: DropRelease; today: string }) {
  if (!r.prerelease) return null
  const { start, end } = r.prerelease
  const now = new Date(`${today}T00:00:00`)
  const live = start <= today && today <= end
  return (
    <Fact icon={<Ticket size={16} />} label="Prerelease events">
      {rangeText(start, end)}{' '}
      <span className="text-ink-3">{live ? '· on now' : end < today ? '· over' : `· ${relDays(start, now)}`}</span>
    </Fact>
  )
}

export function PreorderFact({ r, today }: { r: DropRelease; today: string }) {
  const s = preorderStatus(r, today)
  if (s.state === 'none') return null
  const now = new Date(`${today}T00:00:00`)
  if (s.state === 'opened' || s.state === 'opens') {
    return (
      <Fact icon={<CalendarCheck size={16} />} label="Pre-orders">
        {s.state === 'opened' ? 'Opened' : 'Opens'} {weekday(s.date)}, {shortDate(s.date)}
        {s.where ? ` at ${s.where}` : ''} <span className="text-ink-3">· {relDays(s.date, now)}</span>
        {s.note && <Muted>{s.note}</Muted>}
      </Fact>
    )
  }
  if (s.state === 'due') {
    return (
      <Fact icon={<Hourglass size={16} />} label="Pre-orders">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          Not open yet <Badge tone="warning">Predicted</Badge>
        </span>
        <Muted>
          Past the usual window ({rangeText(s.from, s.to)}), so it could open any day. Prediction, not an announcement: {s.basis}.
        </Muted>
      </Fact>
    )
  }
  return (
    <Fact icon={<Hourglass size={16} />} label="Pre-orders">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {s.inWindow ? 'Could open any day now' : `Likely ${rangeText(s.from, s.to)}`} <Badge tone="warning">Predicted</Badge>
      </span>
      <Muted>
        Most likely {weekday(s.likely)}, {shortDate(s.likely)}. Prediction, not an announcement: {s.basis}.
      </Muted>
    </Fact>
  )
}

/** Japan <-> English: the real pairing, or a predicted English window. */
export function PairFact({ r, today }: { r: DropRelease; today: string }) {
  const p = r.pair
  const pred = r.englishPrediction
  if (!p && !pred) return null
  const now = new Date(`${today}T00:00:00`)
  if (pred) {
    const lead = r.region === 'JP' ? 'English version expected' : 'Predicted English release'
    return (
      <Fact icon={<ArrowRightLeft size={16} />} label="Japan to English">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {lead} {rangeText(pred.from, pred.to)} <Badge tone="warning">Predicted</Badge>
        </span>
        <Muted>
          Most likely around {shortDate(pred.likely)} ({daysUntil(pred.likely, now) > 0 ? relDays(pred.likely, now) : 'soon'}). {pred.basis}; possible range {rangeText(pred.min, pred.max)}.
          {r.region === 'JP' && !r.pair ? ' Only if this set is localized.' : ''}
        </Muted>
      </Fact>
    )
  }
  if (!p) return null
  const name = shortName(p.name)
  if (r.region === 'EN') {
    return (
      <Fact icon={<ArrowRightLeft size={16} />} label="Japanese version">
        {name}
        {p.date ? ` came out ${shortDate(p.date)}` : ''}
        {p.lagDays != null && <span className="text-ink-3"> · English followed {p.lagDays} days later</span>}
      </Fact>
    )
  }
  return (
    <Fact icon={<ArrowRightLeft size={16} />} label="English version">
      {name}
      {p.date ? `, ${shortDate(p.date)}` : ' (not dated yet)'}
      {p.lagDays != null && <span className="text-ink-3"> · {p.lagDays} days after Japan</span>}
    </Fact>
  )
}
