// What the alert engine records in data/alerts-log.json (and the site shows as "Recent alerts").

export interface AlertLogEntry {
  /** Stable dedupe key, e.g. "target:abc" or "drawing:post-1:3h". */
  key: string
  /** Rule that produced it, e.g. "watch-target", "drawing-closing". */
  kind: string
  /** When it was sent (ISO). */
  at: string
  title: string
  body: string
  /** Where tapping it goes. */
  click: string
  /** "all" or the person ids it went to. */
  to: 'all' | string[]
  priority: number
  /** Sent inside the "and N more" summary rather than on its own. */
  folded?: boolean
}
