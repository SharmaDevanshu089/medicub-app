import type { StockItem } from '../store/types'

/** Parses name,batch,YYYY-MM-DD,qty rows (header optional). Bad rows are reported, never imported. */
export function parseStockCsv(text: string): { rows: StockItem[]; errors: string[] } {
  const rows: StockItem[] = []
  const errors: string[] = []
  text.trim().split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || (i === 0 && /^name\s*,/i.test(line))) return
    const [name, batch, expiry, qty] = line.split(',').map((x) => x.trim())
    const n = Number(qty)
    if (!name || !batch || !expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isInteger(n) || n < 0) errors.push(`Line ${i + 1}: expected name,batch,YYYY-MM-DD,qty — got “${line}”`)
    else rows.push({ name, batch, expiry, qty: n })
  })
  return { rows, errors }
}
