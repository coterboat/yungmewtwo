// Link from the deal checker to the Board's "new deal" form (the Board reads these params).
export function boardDealPath({ productId, price, store }: { productId: number; price: number; store?: string }): string {
  const q = new URLSearchParams({ new: 'deal', product: String(productId), price: String(Math.round(price * 100) / 100) })
  if (store?.trim()) q.set('store', store.trim())
  return `/board?${q.toString()}`
}
