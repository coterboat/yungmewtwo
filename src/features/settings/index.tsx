import { PageHeader } from '../../components/ui.tsx'
import { AlertsSection } from './AlertsSection.tsx'
import { InviteSection } from './InviteSection.tsx'
import { KeySection } from './KeySection.tsx'
import { AppearanceSection, CalendarSection, DataSection } from './MoreSections.tsx'
import { YouSection } from './YouSection.tsx'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" sub="Who you are, your posting key, phone alerts and the calendar. It all lives on this device." />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="grid min-w-0 grid-cols-1 gap-5">
          <YouSection />
          <KeySection />
          <InviteSection />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5">
          <AlertsSection />
          <CalendarSection />
          <AppearanceSection />
          <DataSection />
        </div>
      </div>
    </div>
  )
}
