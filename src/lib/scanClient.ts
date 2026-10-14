// Browser side of card scanning: shrink photos, ask Claude to read the cards, report the cost.
// The API key is the viewer's own and never leaves their device except to Anthropic.
import Anthropic from '@anthropic-ai/sdk'
import { parseScan, SCAN_PROMPT, SCAN_SCHEMA, type Detected } from './scan.ts'

export const SCAN_MODELS = {
  'claude-opus-5-5': { label: 'Opus 5.5', blurb: 'Most accurate; best for binder pages and piles', inPerM: 4, outPerM: 20 },
  'claude-haiku-5-5': { label: 'Haiku 5.5', blurb: 'Much cheaper; fine for one or two clear cards', inPerM: 0.1, outPerM: 0.5 },
} as const
export type ScanModel = keyof typeof SCAN_MODELS

/** Long edge we send. Opus/Haiku 5.5 read up to 2576px; small collector numbers need the detail. */
const MAX_EDGE = 2576

export interface PreparedPhoto {
  data: string
  preview: string
  width: number
  height: number
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo.'))), 'image/jpeg', 0.88))
  const data = await new Promise<string>((res) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1])
    r.readAsDataURL(blob)
  })
  return { data, preview: URL.createObjectURL(blob), width, height }
}

export interface ScanResult {
  cards: Detected[]
  /** Dollars this request cost at list price. */
  cost: number
  model: string
}

export async function scanPhotos(photos: PreparedPhoto[], apiKey: string, model: ScanModel): Promise<ScanResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  // Opus routes a safety-classifier decline to Anthropic's recommended fallback model instead of
  // failing; Haiku has no server-side fallback.
  const fallback: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, 'betas' | 'fallbacks'> =
    model === 'claude-opus-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...fallback,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCAN_SCHEMA as unknown as Record<string, unknown> } },
      system: SCAN_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: p.data } })),
            { type: 'text', text: photos.length > 1 ? `List every card across these ${photos.length} photos.` : 'List every card in this photo.' },
          ],
        },
      ],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the API key. Check it in the scan settings.')
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error("This API key isn't allowed to use that model.")
    if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limited by Anthropic. Wait a minute and try again.')
    if (err instanceof Anthropic.BadRequestError) throw new Error(`Anthropic couldn't take that request: ${err.message}`)
    if (err instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Anthropic. Check your connection.")
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic error ${err.status}: ${err.message}`)
    throw err
  }
  if (res.stop_reason === 'refusal') throw new Error("The model declined to read this photo. Try a different shot.")
  const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text
  if (!text) throw new Error('The scan came back empty. Try again with a clearer photo.')
  if (res.stop_reason === 'max_tokens') throw new Error('Too many cards in one go. Try fewer per photo.')
  const price = SCAN_MODELS[model]
  const cost = (res.usage.input_tokens * price.inPerM + res.usage.output_tokens * price.outPerM) / 1_000_000
  return { cards: parseScan(text), cost, model: res.model }
}
