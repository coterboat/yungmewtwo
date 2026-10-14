// Drives the scan page with Anthropic's API mocked: upload -> scan -> matched results.
// Usage: node scripts/dev/scan-e2e.mjs <outDir> <baseUrl>
import { chromium } from '@playwright/test'

const [outDir, base] = process.argv.slice(2)
const read = (name, number, setCode, extra = {}) => ({ name, number, setCode, setName: '', language: 'EN', variant: 'holo', kind: 'card', quantity: 1, confidence: 'high', note: '', ...extra })
const cards = [
  read('Charizard ex', '199/165', 'MEW'),
  read('Mew ex', '151/165', 'MEW'),
  read('Lurantis ex', '004/084', 'PBL', { quantity: 2 }),
  read('Pikachu', '', '', { confidence: 'low', note: 'number covered by sleeve' }),
  read('Pitch Black Booster Box', '', '', { kind: 'sealed', variant: 'unknown' }),
]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
await ctx.addInitScript(() => localStorage.setItem('yungmewtwo:prefs', JSON.stringify({ me: 'alex', anthropicKey: 'sk-ant-test', scanModel: 'claude-opus-5-5' })))
let request
await ctx.route('https://api.anthropic.com/**', async (route) => {
  request = JSON.parse(route.request().postData() ?? '{}')
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify({ cards }) }],
      usage: { input_tokens: 5200, output_tokens: 900 },
    }),
  })
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${base}#/scan`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', 'public/icon-512.png')
await page.getByRole('button', { name: /Scan 1 photo/ }).click()
await page.getByText('Best pull').waitFor({ timeout: 15000 })
await page.waitForLoadState('networkidle'); await page.waitForTimeout(800); await page.screenshot({ path: `${outDir}/scan-results.png` })
console.log('request model:', request.model, '| fallbacks:', request.fallbacks, '| effort:', request.output_config?.effort, '| images:', request.messages[0].content.filter((c) => c.type === 'image').length)
console.log('rows:', await page.locator('[role=checkbox]').count(), '| add button:', await page.getByRole('button', { name: /Add \d+ card/ }).textContent().catch(() => 'n/a'))
if (errors.length) console.log('PAGE ERRORS', errors)
await browser.close()
