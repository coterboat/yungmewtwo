// The calendar feed: public/calendar.ics (outside public/data, so phones can subscribe to
// https://coterboat.github.io/yungmewtwo/calendar.ics). Releases come from drops.json (built by
// 30-drops.ts, which runs first); drawings, drops and weekly events from data/user/.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DropsData } from '../../src/lib/drops.ts'
import { buildCalendar, postEvents, recurringEvents, releaseEvents } from '../../src/lib/dropsIcs.ts'
import type { Person, Post, Recurring } from '../../src/lib/user.ts'
import type { BuildContext } from '../build-site-data.ts'
import { PUBLIC_DATA, ROOT, readJson } from '../lib/io.ts'

export async function build(ctx: BuildContext) {
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const drops = await readJson<DropsData | null>(resolve(PUBLIC_DATA, 'drops.json'), null)
  const people = await ctx.readData<Person[]>('user/people.json', [])
  const posts = await ctx.readData<Post[]>('user/posts.json', [])
  const recurring = await ctx.readData<Recurring[]>('user/recurring.json', [])

  const events = [
    ...(drops ? releaseEvents(drops.releases, today) : []),
    ...postEvents(posts, people, now),
    // Weekly events start counting from the day price tracking began, so their UIDs and first date never move.
    ...recurringEvents(recurring, ctx.dates[0] ?? today),
  ]
  const text = buildCalendar(events, {
    name: 'yungmewtwo drops',
    description: 'Pokémon TCG releases, prerelease windows, pre-order dates (predicted ones are marked), drawing deadlines and weekly drops.',
    now,
  })
  const path = resolve(ROOT, 'public', 'calendar.ics')
  await mkdir(resolve(ROOT, 'public'), { recursive: true })
  await writeFile(path, text)
  ctx.log(`calendar.ics: ${events.length} events`)
}
