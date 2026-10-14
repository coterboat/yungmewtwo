import { Eye, ExternalLink, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Chips, Empty, Section, cx } from '../../components/ui.tsx'
import { TAG_LABEL, describeSource, isCategoryTag, type NewsFile, type NewsItem } from '../../lib/dropsNews.ts'
import { ago } from '../../lib/format.ts'

const PAGE = 12

function tagTone(tag: string): 'critical' | 'holo' | 'good' | 'accent' | 'neutral' {
  if (tag === 'price-error') return 'critical'
  if (tag === 'drawing') return 'holo'
  if (tag === 'restock') return 'good'
  if (tag === 'preorder') return 'accent'
  return 'neutral'
}

function Row({ item, sourceName }: { item: NewsItem; sourceName: string }) {
  const watch = item.watch?.filter((w) => w.level === 'product') ?? []
  return (
    <li>
      <a href={item.link} target="_blank" rel="noreferrer" className="group block rounded-xl px-2 py-2.5 transition hover:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <div className="line-clamp-2 text-[14px] leading-snug font-medium group-hover:underline">{item.title}</div>
          <ExternalLink size={14} className="mt-1 shrink-0 text-ink-3" aria-label="Opens in a new tab" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          <span>{sourceName}</span>
          <span aria-hidden>·</span>
          <span>{ago(item.date)}</span>
          {item.tags.slice(0, 4).map((t) => (
            <Badge key={t} tone={isCategoryTag(t) ? tagTone(t) : 'neutral'}>
              {TAG_LABEL[t] ?? t}
            </Badge>
          ))}
          {watch.length > 0 && (
            <Badge tone="accent" icon={<Eye size={12} aria-hidden />}>
              On your watchlist
            </Badge>
          )}
        </div>
      </a>
    </li>
  )
}

export function News({ news }: { news: NewsFile }) {
  const [filter, setFilter] = useState('all')
  const [shown, setShown] = useState(PAGE)

  const options = useMemo(() => {
    const counts = new Map<string, number>()
    let watching = 0
    for (const it of news.items) {
      for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
      if (it.watch?.some((w) => w.level === 'product')) watching++
    }
    const cats = ['price-error', 'drawing', 'restock', 'preorder', 'deal', 'reveal'].filter((t) => counts.has(t))
    const stores = [...counts.entries()]
      .filter(([t]) => !isCategoryTag(t))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)
    return [
      { value: 'all', label: 'All', count: news.items.length },
      ...(watching ? [{ value: 'watch', label: 'Your watchlist', count: watching }] : []),
      ...[...cats, ...stores].map((t) => ({ value: t, label: TAG_LABEL[t] ?? t, count: counts.get(t) })),
    ]
  }, [news.items])

  const items = useMemo(() => {
    if (filter === 'all') return news.items
    if (filter === 'watch') return news.items.filter((i) => i.watch?.some((w) => w.level === 'product'))
    return news.items.filter((i) => i.tags.includes(filter))
  }, [news.items, filter])

  const sources = Object.entries(news.sources)
  const problems = sources.filter(([, s]) => s.status !== 'ok')

  return (
    <Section title="News" sub="Deals, restocks, drawings and reveals from PokéBeach and Reddit. Tap through to the original post.">
      {problems.length > 0 && (
        <div className="mb-3 grid gap-1.5 rounded-2xl border border-line bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-3.5 text-[13px]" role="status">
          {problems.map(([id, s]) => (
            <div key={id} className="flex gap-2">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {describeSource(s)}.{s.lastOk ? ` Last good read ${ago(s.lastOk)}; older posts are still listed.` : ' Nothing from it yet.'}
              </span>
            </div>
          ))}
        </div>
      )}

      {news.items.length === 0 ? (
        <Empty title="No news yet">The news puller runs every half hour. Posts appear here once it has read the feeds.</Empty>
      ) : (
        <>
          <Chips options={options} value={filter} onChange={(v) => { setFilter(v); setShown(PAGE) }} />
          <ul className="mt-2 -mx-2">
            {items.slice(0, shown).map((it) => (
              <Row key={it.id} item={it} sourceName={news.sources[it.source]?.name ?? it.source} />
            ))}
          </ul>
          {items.length === 0 && <p className="py-6 text-center text-sm text-ink-3">Nothing tagged that way in the latest posts.</p>}
          {items.length > shown && (
            <Button variant="ghost" className="mt-1 w-full" onClick={() => setShown(shown + PAGE)}>
              Show more ({items.length - shown} left)
            </Button>
          )}
        </>
      )}

      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[12px] text-ink-3">
          {sources.map(([id, s]) => (
            <span key={id} className="inline-flex items-center gap-1.5">
              <span className={cx('inline-block h-1.5 w-1.5 rounded-full', s.status === 'ok' ? 'bg-up' : s.status === 'pending' ? 'bg-surface-3' : 'bg-down')} aria-hidden />
              {s.name}: {s.status === 'ok' ? `ok${s.lastOk ? `, read ${ago(s.lastOk)}` : ''}` : s.status}
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}
