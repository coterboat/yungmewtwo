// Copies the files you two write (data/user/) and the hand-curated seed data (data/seed/) into
// the site, so viewers without a posting key still see everything.
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { BuildContext } from '../build-site-data.ts'
import { DATA } from '../lib/io.ts'

export async function build(ctx: BuildContext) {
  for (const dir of ['user', 'seed']) {
    let files: string[] = []
    try {
      files = (await readdir(resolve(DATA, dir))).filter((f) => f.endsWith('.json'))
    } catch {
      continue
    }
    for (const f of files) await ctx.write(`${dir}/${f}`, await ctx.readData(`${dir}/${f}`, null))
    ctx.log(`${dir}: ${files.length} files`)
  }
}
