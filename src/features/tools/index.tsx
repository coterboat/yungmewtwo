// Tools: four calculators, each keeping its inputs in the URL so a result can be shared by link.
// /tools?tab=deal|ev|flip|grade
import { Calculator, PackageOpen, Repeat, Tag, Award, type LucideIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { PageHeader, Skeleton, cx } from '../../components/ui.tsx'
import { useSearchParams } from 'react-router-dom'

const DealTool = lazy(() => import('./DealTool.tsx'))
const EvTool = lazy(() => import('./EvTool.tsx'))
const FlipTool = lazy(() => import('./FlipTool.tsx'))
const GradeTool = lazy(() => import('./GradeTool.tsx'))

type TabId = 'deal' | 'ev' | 'flip' | 'grade'

const TABS: Array<{ id: TabId; label: string; short: string; icon: LucideIcon; blurb: string }> = [
  { id: 'deal', label: 'Deal check', short: 'Deal', icon: Tag, blurb: 'Is this price good? Scored against market and MSRP.' },
  { id: 'ev', label: 'Open vs sealed', short: 'Open', icon: PackageOpen, blurb: 'What a sealed product is worth if you rip it, and how often you would win.' },
  { id: 'flip', label: 'Flip', short: 'Flip', icon: Repeat, blurb: 'What you keep after fees, your ROI, and your break-even price.' },
  { id: 'grade', label: 'Grading', short: 'Grade', icon: Award, blurb: 'Send it to PSA or sell it raw? Expected value after every cost.' },
]

export default function ToolsPage() {
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t.id === sp.get('tab'))?.id ?? 'deal') as TabId
  const current = TABS.find((t) => t.id === tab) as (typeof TABS)[number]

  return (
    <div>
      <PageHeader title="Tools" sub={current.blurb} action={<Calculator size={22} className="hidden text-ink-3 sm:block" aria-hidden />} />
      <div role="tablist" aria-label="Tools" className="mb-6 grid grid-cols-4 gap-1.5 rounded-2xl border border-line bg-surface-2 p-1 sm:inline-grid sm:grid-cols-[repeat(4,auto)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setSp({ tab: t.id }, { replace: true })}
            className={cx(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[12px] font-medium transition sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-[13px]',
              t.id === tab ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            <t.icon size={18} aria-hidden />
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <Suspense
        fallback={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        }
      >
        <div key={tab}>
          {tab === 'deal' && <DealTool />}
          {tab === 'ev' && <EvTool />}
          {tab === 'flip' && <FlipTool />}
          {tab === 'grade' && <GradeTool />}
        </div>
      </Suspense>
    </div>
  )
}
