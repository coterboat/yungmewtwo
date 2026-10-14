// Calendar, Appearance and Data: the smaller Settings sections.
import { CalendarCheck, Database, ExternalLink, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { Segmented, Stat } from '../../components/ui.tsx'
import { REPO } from '../../lib/config.ts'
import { useMeta } from '../../lib/data.ts'
import { ago, num, shortDate } from '../../lib/format.ts'
import { calendarHttpsUrl, calendarWebcalUrl, googleCalendarUrl } from '../../lib/ntfySetup.ts'
import { setPrefs, usePrefs, type Prefs } from '../../lib/prefs.ts'
import { ExternalLinkButton, LinkButton } from '../board/bits.tsx'
import { CopyButton, SettingsCard } from './shared.tsx'

export function CalendarSection() {
  return (
    <SettingsCard id="calendar" icon={<CalendarCheck size={18} />} title="Calendar" sub="Subscribe once and every release and drop lands in your own calendar app.">
      <div className="grid gap-3">
        <LinkButton href={calendarWebcalUrl()} variant="primary" className="w-full">
          Subscribe to the drops calendar
        </LinkButton>
        <div className="grid grid-cols-2 gap-2">
          <ExternalLinkButton href={googleCalendarUrl()} className="!px-2 !text-[13px] whitespace-nowrap">
            Google Calendar <ExternalLink size={14} aria-hidden />
          </ExternalLinkButton>
          <CopyButton text={calendarHttpsUrl()} label="Copy link" copiedLabel="Link copied" />
        </div>
        <p className="text-[12.5px] text-ink-3">On an iPhone the first button opens Calendar and asks to subscribe. Calendar apps refresh subscriptions on their own schedule, often every few hours, so a brand-new drop can take a while to appear. For a drop you can't wait on, use Add to calendar on its Board post.</p>
      </div>
    </SettingsCard>
  )
}

const THEMES: Array<{ value: Prefs['theme']; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
]

export function AppearanceSection() {
  const { theme } = usePrefs()
  return (
    <SettingsCard icon={<Palette size={18} />} title="Appearance" sub="System follows your phone or computer's light and dark setting.">
      <Segmented
        value={theme}
        onChange={(v) => setPrefs({ theme: v })}
        options={THEMES.map((t) => ({
          value: t.value,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <t.icon size={14} aria-hidden /> {t.label}
            </span>
          ),
        }))}
      />
    </SettingsCard>
  )
}

export function DataSection() {
  const { data: meta } = useMeta()
  const repoUrl = `https://github.com/${REPO.owner}/${REPO.name}`
  return (
    <SettingsCard icon={<Database size={18} />} title="Data" sub="Everything here comes from public files in the repo. Each post is a commit, so there's always a history.">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Prices as of" value={meta ? shortDate(meta.latest) : '…'} sub={meta ? `${num(meta.counts.priced)} priced products` : undefined} />
        <Stat label="Site built" value={meta ? ago(meta.builtAt) : '…'} sub={meta ? `${num(meta.dates.length)} snapshot day${meta.dates.length === 1 ? '' : 's'} so far` : undefined} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ExternalLinkButton href={repoUrl}>
          Repository <ExternalLink size={14} aria-hidden />
        </ExternalLinkButton>
        <ExternalLinkButton href={`${repoUrl}/actions`}>
          Actions <ExternalLink size={14} aria-hidden />
        </ExternalLinkButton>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">Prices are TCGplayer market prices (recent sales), refreshed about once a day.</p>
    </SettingsCard>
  )
}
