import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { Badge, Card, Empty, Section } from '../../components/ui.tsx'
import { attachProducts, type DropsData } from '../../lib/drops.ts'
import { daysUntil, shortDate } from '../../lib/format.ts'
import { ProductTable } from './ProductTable.tsx'

type Group = DropsData['justListed'][number]

const cleanName = (n: string) => n.replace(/^[A-Za-z]+\d*(\.\d+)?:\s*/, '')

function GroupCard({ g }: { g: Group }) {
  const rows = useMemo(() => attachProducts([], g.products), [g.products])
  const presale = g.products.some((p) => p.presale)
  // A catch-all bucket ("Miscellaneous", dated years ago) says nothing; its pre-sale items' own dates do.
  const dates = g.products.filter((p) => p.presale && p.released).map((p) => p.released!).sort()
  const bucket = presale && dates.length > 0 && daysUntil(g.released) < -60
  const when = bucket ? `Pre-sale items come out ${dates[0] === dates[dates.length - 1] ? shortDate(dates[0]) : `${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}`}` : `Releases ${shortDate(g.released)}`
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{cleanName(g.name)}</h3>
        <Badge tone={g.lang === 'EN' ? 'accent' : 'neutral'}>{g.lang === 'EN' ? 'English' : 'Japanese'}</Badge>
        {g.isNew ? <Badge tone="holo">New on TCGplayer</Badge> : presale ? <Badge>Pre-selling</Badge> : null}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">
        {when}
        {g.listedDaysAgo != null ? ` · listed ${g.listedDaysAgo === 0 ? 'today' : g.listedDaysAgo === 1 ? 'yesterday' : `${g.listedDaysAgo} days ago`}` : ''}
      </p>
      <ProductTable rows={rows} limit={3} className="mt-1.5" />
      <Link to={`/market/set/${g.groupId}`} className="inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:underline">
        Open the set in Market
      </Link>
    </Card>
  )
}

/** New TCGplayer groups, and sets that are pre-selling right now. */
export function JustListed({ groups }: { groups: Group[] }) {
  return (
    <Section title="Just listed on TCGplayer" sub="New sets and pre-sale prices. TCGplayer lists a set about 11 weeks early, and pre-sale prices tend to run well over MSRP.">
      {groups.length === 0 ? (
        <Empty title="Nothing new in the last 14 days">We check TCGplayer every night. New sets show up here the day after they appear.</Empty>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <GroupCard key={g.groupId} g={g} />
          ))}
        </div>
      )}
    </Section>
  )
}
