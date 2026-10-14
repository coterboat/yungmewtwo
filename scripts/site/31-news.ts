// News and the alert log: copies data/news.json and data/alerts-log.json into the site
// (public/data/news.json, public/data/alerts.json) for the Drops page.
import type { AlertLogEntry } from '../../src/lib/dropsAlerts.ts'
import type { NewsFile } from '../../src/lib/dropsNews.ts'
import type { BuildContext } from '../build-site-data.ts'

const RECENT_ALERTS = 40

export async function build(ctx: BuildContext) {
  const news = await ctx.readData<NewsFile>('news.json', { updatedAt: '', sources: {}, items: [] })
  await ctx.write('news.json', news)

  const log = await ctx.readData<AlertLogEntry[]>('alerts-log.json', [])
  const recent = [...log].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, RECENT_ALERTS)
  await ctx.write('alerts.json', recent)
  ctx.log(`news: ${news.items.length} items from ${Object.keys(news.sources).length} sources; ${recent.length} recent alerts`)
}
