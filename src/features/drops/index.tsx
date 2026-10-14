// Drops: the release radar. What's coming (with predictions marked), what TCGplayer just listed,
// how recent sets are holding up against MSRP, the news, and the calendar feed.
import { CalendarPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, ErrorNote, PageHeader, Section, Segmented, Skeleton, Toggle } from '../../components/ui.tsx'
import { addDays, heroRelease } from '../../lib/drops.ts'
import { CalendarSheet } from './CalendarSheet.tsx'
import { Hero } from './Hero.tsx'
import { Holding } from './Holding.tsx'
import { localToday, readFilters, saveFilters, useAlertLog, useDrops, useNews, type DropFilters } from './hooks.ts'
import { JustListed } from './JustListed.tsx'
import { News } from './News.tsx'
import { RecentAlerts } from './RecentAlerts.tsx'
import { Timeline } from './Timeline.tsx'

/** Recently released sets stay in the timeline this long, marked "Out now". */
const KEEP_PAST_DAYS = 14
const SIDE = 'lg:grid-cols-[minmax(0,1fr)_380px]'

export default function DropsPage() {
  const { data, error, loading } = useDrops()
  const news = useNews()
  const alerts = useAlertLog()
  const [filters, setFilters] = useState<DropFilters>(readFilters)
  const [calendar, setCalendar] = useState(false)
  useEffect(() => saveFilters(filters), [filters])

  const today = localToday()
  const hero = useMemo(() => (data ? heroRelease(data.releases, today) : undefined), [data, today])
  const visible = useMemo(() => {
    if (!data) return []
    const since = addDays(today, -KEEP_PAST_DAYS)
    return data.releases.filter(
      (r) => (r.date === null || r.date >= since) && (filters.lang === 'ALL' || r.region === filters.lang) && !(filters.hideRumors && r.confidence === 'low'),
    )
  }, [data, filters, today])

  return (
    <div>
      <PageHeader
        title="Drops"
        sub="What's coming, when pre-orders usually open, and what TCGplayer is pricing."
        action={
          <Button onClick={() => setCalendar(true)}>
            <CalendarPlus size={17} aria-hidden /> Calendar
          </Button>
        }
      />

      {error && <ErrorNote>Couldn't load the release data ({error.message}). Try again in a minute.</ErrorNote>}
      {loading && (
        <div className="grid gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {data && (
        <>
          {hero ? <Hero release={hero} /> : <Empty title="No English release is dated yet">Pre-orders and dates show up here as soon as they're announced.</Empty>}

          <div className={`mt-9 grid gap-x-10 gap-y-9 ${SIDE}`}>
            <Section
              title="Release timeline"
              sub="Dates from our curated calendar. Predictions say so, and rumors are marked."
              action={undefined}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Segmented
                  options={[
                    { value: 'ALL', label: 'Both' },
                    { value: 'EN', label: 'English' },
                    { value: 'JP', label: 'Japanese' },
                  ]}
                  value={filters.lang}
                  onChange={(lang) => setFilters({ ...filters, lang })}
                />
                <div className="w-[190px]">
                  <Toggle checked={filters.hideRumors} onChange={(hideRumors) => setFilters({ ...filters, hideRumors })} label="Hide rumors" />
                </div>
              </div>
              <Timeline releases={visible} today={today} />
            </Section>

            <div>
              <JustListed groups={data.justListed} />
              <Holding rows={data.holding} historyDays={data.historyDays} />
            </div>
          </div>
        </>
      )}

      <div className={`mt-9 grid gap-x-10 ${SIDE}`}>
        <div>{news.data ? <News news={news.data} /> : news.loading ? <Skeleton className="h-64" /> : <ErrorNote>Couldn't load the news ({news.error?.message}).</ErrorNote>}</div>
        <div>{alerts.data ? <RecentAlerts log={alerts.data} /> : alerts.loading ? <Skeleton className="h-40" /> : null}</div>
      </div>

      <CalendarSheet open={calendar} onClose={() => setCalendar(false)} />
    </div>
  )
}
