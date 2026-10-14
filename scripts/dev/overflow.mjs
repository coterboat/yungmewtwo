// Fails if any screen scrolls sideways at phone width (the most common layout bug here).
// Usage: node scripts/dev/overflow.mjs <baseUrl> [route,route,...]
import { chromium } from '@playwright/test'

const [base, list] = process.argv.slice(2)
const routes = (list ?? '/,/market,/drops,/board,/hunt,/vault,/tools,/settings,/scan').split(',')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
await ctx.addInitScript(() => localStorage.setItem('yungmewtwo:prefs', JSON.stringify({ me: 'alex' })))
const page = await ctx.newPage()
const errors = []
let current = ''
page.on('pageerror', (e) => errors.push(`${current}: ${e.stack ?? e}`))
let bad = 0
for (const r of routes) {
  current = r
  await page.goto(`${base}#${r}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const culprit = over > 0 ? await page.evaluate(() => {
    const w = window.innerWidth
    const el = [...document.querySelectorAll('body *')].find((e) => e.getBoundingClientRect().right > w + 1 && getComputedStyle(e).position !== 'fixed')
    return el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}` : '?'
  }) : ''
  console.log(`${over > 0 ? 'FAIL' : 'ok  '} ${r}${over > 0 ? ` +${over}px (${culprit})` : ''}`)
  if (over > 0) bad++
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'))
await browser.close()
process.exit(bad || errors.length ? 1 : 0)
