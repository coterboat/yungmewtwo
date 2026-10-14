import { CalendarPlus, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from '../../components/toast.tsx'
import { Button, Sheet } from '../../components/ui.tsx'
import { SITE_URL } from '../../lib/config.ts'
import { LinkButton } from './bits.tsx'

const HTTPS = `${SITE_URL}calendar.ics`
const WEBCAL = HTTPS.replace(/^https:/, 'webcal:')
const GOOGLE = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL)}`

/** Subscribe buttons: the calendar stays current on its own, so there is nothing to re-import. */
export function CalendarSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(HTTPS)
      setCopied(true)
      toast('Calendar link copied')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast('Could not copy. Long-press the link to copy it.', 'error')
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add the drops calendar">
      <p className="text-sm text-ink-2">
        Releases, prerelease windows, pre-order dates, drawing deadlines and the weekly Walmart drawing, in your own calendar app. Predicted pre-order windows are marked "(predicted)". It updates itself about once an hour.
      </p>
      <div className="mt-4 grid gap-2.5">
        <LinkButton variant="primary" href={WEBCAL}>
          <CalendarPlus size={17} aria-hidden /> Apple Calendar, Outlook and others
        </LinkButton>
        <LinkButton href={GOOGLE} target="_blank" rel="noreferrer">
          <CalendarPlus size={17} aria-hidden /> Google Calendar
        </LinkButton>
        <Button onClick={copy}>
          {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />} {copied ? 'Copied' : 'Copy the calendar link'}
        </Button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">
        Google can take a few hours to show new events; Apple and Outlook usually refresh within the hour. If a button does nothing on your computer, copy the link and paste it into "add calendar from URL".
      </p>
    </Sheet>
  )
}
