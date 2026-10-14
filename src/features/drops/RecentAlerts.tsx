import { Bell, BellRing } from 'lucide-react'
import { Badge, Card, Empty, Section } from '../../components/ui.tsx'
import { SITE_URL } from '../../lib/config.ts'
import type { AlertLogEntry } from '../../lib/dropsAlerts.ts'
import { ago } from '../../lib/format.ts'
import { usePeople } from '../../lib/people.ts'

/** Same-site links open inside the app; everything else in a new tab. */
function hrefFor(click: string): { href: string; external: boolean } {
  return click.startsWith(`${SITE_URL}#`) ? { href: click.slice(SITE_URL.length), external: false } : { href: click, external: true }
}

export function RecentAlerts({ log }: { log: AlertLogEntry[] }) {
  const people = usePeople()
  const who = (to: AlertLogEntry['to']) => (to === 'all' ? 'Everyone' : to.map((id) => people.find((p) => p.id === id)?.name ?? id).join(' & '))
  return (
    <Section title="Recent alerts" sub="What was sent to your phones lately. Prices, drawings, drops and new listings.">
      {log.length === 0 ? (
        <Empty icon={<Bell size={20} aria-hidden />} title="Nothing sent yet">
          Alerts show up here after they go out: a price target hit, a drawing about to close, a new post from the other of you.
        </Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {log.slice(0, 12).map((a) => {
              const { href, external } = hrefFor(a.click)
              return (
                <li key={`${a.key}-${a.at}`}>
                  <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className="flex gap-3 px-3.5 py-3 transition hover:bg-surface-2">
                    <BellRing size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[13.5px] leading-snug font-medium">{a.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{a.body}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                        {ago(a.at)} · {who(a.to)}
                        {a.priority >= 4 && <Badge tone="warning">High priority</Badge>}
                        {a.folded && <Badge>In a summary</Badge>}
                      </div>
                    </div>
                  </a>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </Section>
  )
}
