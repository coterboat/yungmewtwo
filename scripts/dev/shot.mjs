// Screenshots pages of the built site for a quick visual check.
// Usage: node scripts/dev/shot.mjs <outDir> <baseUrl> <route>[,route...] [--phone] [--light]
import { chromium } from '@playwright/test'

const [outDir, base, routesArg, ...flags] = process.argv.slice(2)
const phone = flags.includes('--phone')
const light = flags.includes('--light')
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: phone ? 2 : 1,
  colorScheme: light ? 'light' : 'dark',
})
await ctx.addInitScript(() => {
  if (!localStorage.getItem('yungmewtwo:prefs')) localStorage.setItem('yungmewtwo:prefs', JSON.stringify({ me: 'alex' }))
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
for (const route of routesArg.split(',')) {
  await page.goto(`${base}#${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const name = (route.replace(/[^a-z0-9]+/gi, '_') || 'home') + (phone ? '-phone' : '') + (light ? '-light' : '')
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: !!flags.includes('--full') })
  console.log(`${outDir}/${name}.png`)
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'))
await browser.close()
