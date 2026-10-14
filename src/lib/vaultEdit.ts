// Edits to a vault file as pure list transforms, safe to apply twice (updateUserFile applies them
// to the local copy at once and again to the newest copy on GitHub). Identical lots fold together.
import type { VaultItem } from './user.ts'

/** Two items with the same key are the same lot (only quantity differs). Sold lines never fold. */
export function lotKey(i: VaultItem): string {
  if (i.status === 'sold') return `sold|${i.id}`
  return [i.productId, i.variant ?? '', i.status, i.condition ?? '', i.grade ?? '', i.cost ?? ''].join('|')
}

/** Folds lots with the same key into the first one, keeping order. */
function merge(items: VaultItem[]): VaultItem[] {
  const out: VaultItem[] = []
  const at = new Map<string, number>()
  for (const i of items) {
    const key = lotKey(i)
    const idx = at.get(key)
    if (idx == null) {
      at.set(key, out.length)
      out.push(i)
    } else out[idx] = { ...out[idx], qty: out[idx].qty + i.qty }
  }
  return out
}

export function addItem(items: VaultItem[], item: VaultItem): VaultItem[] {
  return merge([...items, item])
}

export type ItemPatch = { [K in keyof VaultItem]?: VaultItem[K] | undefined }

export function updateItem(items: VaultItem[], id: string, patch: ItemPatch): VaultItem[] {
  if (!items.some((i) => i.id === id)) return items
  return merge(
    items.map((i) => {
      if (i.id !== id) return i
      const next: Record<string, unknown> = { ...i }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k]
        else next[k] = v
      }
      next.qty = Math.max(1, Math.round(Number(next.qty) || 1))
      return next as unknown as VaultItem
    }),
  )
}

export function removeItem(items: VaultItem[], id: string): VaultItem[] {
  return items.filter((i) => i.id !== id)
}
