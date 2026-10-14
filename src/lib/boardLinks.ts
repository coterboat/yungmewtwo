// Pasted-link helpers for the Board composer: pull a link out of whatever got pasted, work out
// which store it is, and guess a title from the product slug. Posts come from other people, so
// anything we render as a link goes through safeHref first.

const STORES: Array<[name: string, domains: string[]]> = [
  ['Target', ['target.com']],
  ['Walmart', ['walmart.com']],
  ['Pokémon Center', ['pokemoncenter.com']],
  ['Best Buy', ['bestbuy.com']],
  ['GameStop', ['gamestop.com']],
  ['Amazon', ['amazon.com', 'amzn.to', 'a.co']],
  ["Dick's Sporting Goods", ['dickssportinggoods.com']],
  ['Costco', ['costco.com']],
  ["Sam's Club", ['samsclub.com']],
  ['Barnes & Noble', ['barnesandnoble.com']],
  ['Five Below', ['fivebelow.com']],
  ['TCGplayer', ['tcgplayer.com']],
  ['eBay', ['ebay.com', 'ebay.us']],
  ['Books-A-Million', ['booksamillion.com']],
  ['Walgreens', ['walgreens.com']],
  ['CVS', ['cvs.com']],
  ['Meijer', ['meijer.com']],
  ['Kroger', ['kroger.com']],
  ['Staples', ['staples.com']],
  ['Michaels', ['michaels.com']],
  ['Hobby Lobby', ['hobbylobby.com']],
  ['Whatnot', ['whatnot.com']],
  ['Mercari', ['mercari.com']],
]

/** Store names we recognize, for the composer's suggestions. */
export const STORE_NAMES = STORES.map(([name]) => name)

const TRAILING = /[.,;:!?)\]}'"]+$/

/** The first link in pasted text (share sheets add words around it); a bare domain gets https. */
export function extractUrl(text: string): string | undefined {
  const t = text.trim()
  if (!t) return undefined
  const full = t.match(/https?:\/\/[^\s<>"']+/i)
  if (full) return full[0].replace(TRAILING, '')
  for (const token of t.split(/\s+/)) {
    if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(token.replace(TRAILING, ''))) {
      return `https://${token.replace(TRAILING, '')}`
    }
  }
  return undefined
}

/** A clean http(s) link from whatever was typed, or undefined. */
export function normalizeUrl(input: string): string | undefined {
  const found = extractUrl(input)
  if (!found) return undefined
  try {
    const u = new URL(found)
    return u.protocol === 'http:' || u.protocol === 'https:' ? found : undefined
  } catch {
    return undefined
  }
}

/** The link only if it is plain http(s): never render javascript: or data: links from the repo. */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

/** Store name for a link's domain (www and other subdomains ignored), or undefined. */
export function detectStore(url: string): string | undefined {
  const link = normalizeUrl(url)
  if (!link) return undefined
  let host: string
  try {
    host = new URL(link).hostname.toLowerCase()
  } catch {
    return undefined
  }
  for (const [name, domains] of STORES) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return name
  }
  return undefined
}

const ACRONYMS = new Set(['tcg', 'etb', 'upc', 'ttv', 'jp', 'sv', 'pc'])
const SMALL = new Set(['of', 'and', 'the', 'a', 'for', 'with', 'in', 'to'])

function titleWord(w: string, first: boolean): string {
  const lower = w.toLowerCase()
  if (lower === 'pokemon') return 'Pokémon'
  if (ACRONYMS.has(lower)) return lower.toUpperCase()
  if (!first && SMALL.has(lower)) return lower
  if (w === lower) return w.charAt(0).toUpperCase() + w.slice(1)
  return w
}

/** A readable product name from the link's slug ("pokemon-etb-box" -> "Pokémon ETB Box"). */
export function suggestTitle(url: string): string | undefined {
  const link = normalizeUrl(url)
  if (!link) return undefined
  let path: string
  try {
    path = new URL(link).pathname
  } catch {
    return undefined
  }
  let best: string[] | undefined
  for (const raw of path.split('/')) {
    let seg = raw
    try {
      seg = decodeURIComponent(raw)
    } catch {
      /* keep the raw segment */
    }
    seg = seg.replace(/\.(?:product\.\d+\.)?(?:p|html?|aspx?|php)$/i, '')
    const words = seg.split(/[-_+\s]+/).filter(Boolean)
    const readable = words.filter((w) => /^[\p{L}][\p{L}\p{N}'&]+$/u.test(w) && /\p{L}{2,}/u.test(w))
    if (readable.length < 2) continue
    if (!best || words.length > best.length) best = words
  }
  if (!best) return undefined
  return best.map((w, i) => titleWord(w, i === 0)).join(' ')
}
