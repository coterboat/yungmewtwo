// Monte Carlo for opening a sealed product. Expected value is an average, and the average of a
// lottery is rarely what happens: a few boxes hit a $400 card and drag it up, most land far
// below. Simulating thousands of products shows the spread, and how often you'd actually profit.

/** Small seeded PRNG so a shared link shows the same simulation. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SimTier {
  rarity: string
  /** Chance a pack has this tier (1 / perPack). */
  p: number
  /** What each card of the rarity is worth; a hit draws one uniformly. */
  values: number[]
}

export interface SimInput {
  tiers: SimTier[]
  packs: number
  /** Flat bulk / reverse value per pack, added to every run. */
  bulkPerPack: number
  runs?: number
  seed?: number
}

export interface SimResult {
  runs: number
  packs: number
  /** Total value of every simulated product, sorted ascending. */
  values: Float64Array
  mean: number
  median: number
  p10: number
  p90: number
  min: number
  max: number
  /** Share of runs with at least one hit, by rarity. */
  atLeastOne: Record<string, number>
  /** Share of runs worth strictly more than `x`. */
  probAbove: (x: number) => number
}

/** Linear-interpolated percentile (q in 0..1) of a sorted array. */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (!n) return 0
  const pos = Math.min(1, Math.max(0, q)) * (n - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Number of hits in `n` packs at chance `p` each, by jumping between hits (cheap when p is small). */
function binomial(rng: () => number, n: number, p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return n
  const lg = Math.log1p(-p)
  let k = 0
  let i = -1
  for (;;) {
    i += 1 + Math.floor(Math.log(1 - rng()) / lg)
    if (i >= n) return k
    k++
  }
}

export function simulate({ tiers, packs, bulkPerPack, runs = 5000, seed = 1 }: SimInput): SimResult {
  const rng = mulberry32(seed)
  const out = new Float64Array(runs)
  const hits = tiers.map(() => 0)
  const bulk = bulkPerPack * packs
  for (let r = 0; r < runs; r++) {
    let total = bulk
    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t]
      const k = binomial(rng, packs, tier.p)
      if (!k) continue
      hits[t]++
      const vals = tier.values
      if (vals.length) for (let j = 0; j < k; j++) total += vals[Math.floor(rng() * vals.length)]
    }
    out[r] = total
  }
  const sum = out.reduce((s, x) => s + x, 0)
  out.sort()
  const atLeastOne: Record<string, number> = {}
  tiers.forEach((t, i) => (atLeastOne[t.rarity] = hits[i] / runs))
  return {
    runs,
    packs,
    values: out,
    mean: runs ? sum / runs : 0,
    median: percentile(out, 0.5),
    p10: percentile(out, 0.1),
    p90: percentile(out, 0.9),
    min: out[0] ?? 0,
    max: out[runs - 1] ?? 0,
    atLeastOne,
    probAbove: (x) => {
      // First index with a value > x (binary search on the sorted runs).
      let lo = 0
      let hi = out.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (out[mid] > x) hi = mid
        else lo = mid + 1
      }
      return runs ? (runs - lo) / runs : 0
    },
  }
}

export interface HistBin {
  lo: number
  hi: number
  count: number
}

/** Equal-width bins over [lo, hi]; values past `hi` fold into the last bin. */
export function histogram(sorted: ArrayLike<number>, bins: number, lo: number, hi: number): { bins: HistBin[]; max: number } {
  const width = (hi - lo) / bins || 1
  const out: HistBin[] = Array.from({ length: bins }, (_, i) => ({ lo: lo + i * width, hi: lo + (i + 1) * width, count: 0 }))
  for (let i = 0; i < sorted.length; i++) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((sorted[i] - lo) / width)))
    out[idx].count++
  }
  return { bins: out, max: Math.max(1, ...out.map((b) => b.count)) }
}

/** The tiers worth calling out as "will I hit one?": SIR, plus the rarest tier of the set. */
export function chaseTiers(rarities: string[], perPack: Record<string, number>): string[] {
  const rarest = [...rarities].sort((a, b) => (perPack[b] ?? 0) - (perPack[a] ?? 0))[0]
  const sir = rarities.find((r) => /special illustration/i.test(r))
  const out = [sir, rarest].filter((r): r is string => !!r)
  return [...new Set(out)]
}
