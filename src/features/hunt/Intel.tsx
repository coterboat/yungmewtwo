// Store intel: what's reported about each retailer (limits, patterns, programs), dated and sourced.
import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, ErrorNote, Skeleton, cx } from '../../components/ui.tsx'
import { useData } from '../../lib/data.ts'
import { shortDate } from '../../lib/format.ts'
import { CHAIN_META, hostLabel, type RetailIntel } from '../../lib/huntChains.ts'
import { ChainBadge } from './bits.tsx'
import type { HuntData } from './useHunt.ts'

const ONLINE_ONLY = new Set(['Pokémon Center', 'Amazon'])

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <h4 className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h4>
      <ul className="grid grid-cols-1 gap-1.5 text-sm text-ink-2">
        {items.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Intel({ data, focus }: { data: HuntData; focus?: string | null }) {
  const { data: intel, error, loading } = useData<RetailIntel[]>('seed/retail.json')
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : ['Target', 'Walmart']))

  const toggle = (name: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  if (loading) return <Skeleton className="h-40" />
  if (error || !intel) return <ErrorNote>Couldn't load store intel. Try again in a moment.</ErrorNote>

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-ink-2">
        What's been reported about each retailer: purchase limits, restock patterns and programs like drawings. Most of it is secondhand, so each entry says when it was checked and where it came from. Your own log (Today tab) beats all of it.
      </p>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        {intel.map((r) => {
          const isOpen = open.has(r.retailer)
          const chains = CHAIN_META.filter((m) => m.intel === r.retailer).map((m) => m.chain)
          const mine = data.stores.filter((s) => !s.hidden && chains.includes(s.chain)).length
          const preview = r.limits[0] ?? r.patterns[0]
          return (
            <Card key={r.retailer} className="overflow-hidden">
              <button type="button" onClick={() => toggle(r.retailer)} aria-expanded={isOpen} className="flex min-h-16 w-full items-start gap-3 p-4 text-left">
                <ChainBadge chain={chains[0] ?? r.retailer} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{r.retailer}</h3>
                    {ONLINE_ONLY.has(r.retailer) && <Badge>Online</Badge>}
                    {mine > 0 && <Badge tone="accent">{mine} near you</Badge>}
                  </div>
                  <p className={cx('mt-0.5 text-[12.5px] text-ink-3', !isOpen && 'line-clamp-2')}>
                    {isOpen ? `Checked ${shortDate(r.asOf)}` : preview}
                  </p>
                </div>
                <ChevronDown size={18} aria-hidden className={cx('mt-1 shrink-0 text-ink-3 transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 gap-4 border-t border-line px-4 py-4">
                  <Block title="Limits" items={r.limits} />
                  <Block title="Patterns" items={r.patterns} />
                  <Block title="Programs" items={r.programs} />
                  <Block title="Notes" items={r.notes} />
                  {r.sources.length > 0 && (
                    <div>
                      <h4 className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Sources (checked {shortDate(r.asOf)})</h4>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {r.sources.map((url) => (
                          <li key={url}>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-[12.5px] text-accent underline-offset-2 hover:underline">
                              {hostLabel(url)} <ExternalLink size={12} aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
