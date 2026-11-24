// Demo brand data — verify against label. Synthetic, for prototype only.
export interface Ingredient {
  name: string
  mg: number
  drugClass: string
}

export interface Product {
  brand: string
  ingredients: Ingredient[]
  form: 'tablet'
  barcode: string // fake demo barcode
  /** Demo price in ₹ for a strip of 10. Synthetic — verify against the pack before relying on it. */
  mrp: number
  /** Government generic (Pradhan Mantri Bhartiya Janaushadhi Pariyojana). */
  janAushadhi?: boolean
}

const amlodipine = (mg: number): Ingredient => ({ name: 'amlodipine', mg, drugClass: 'Calcium channel blocker' })
const telmisartan = (mg: number): Ingredient => ({ name: 'telmisartan', mg, drugClass: 'ARB' })

const metformin = (mg: number): Ingredient => ({ name: 'metformin', mg, drugClass: 'Biguanide' })
const atorvastatin = (mg: number): Ingredient => ({ name: 'atorvastatin', mg, drugClass: 'Statin' })

// Prices are illustrative demo values per strip of 10 — NOT real MRPs.
export const CATALOG: Product[] = [
  { brand: 'Amlong 5', ingredients: [amlodipine(5)], form: 'tablet', barcode: '8900000000011', mrp: 38 },
  { brand: 'Telma-AM 40/5', ingredients: [telmisartan(40), amlodipine(5)], form: 'tablet', barcode: '8900000000028', mrp: 120 },
  { brand: 'Stamlo 5', ingredients: [amlodipine(5)], form: 'tablet', barcode: '8900000000035', mrp: 45 },
  { brand: 'Glycomet 500', ingredients: [metformin(500)], form: 'tablet', barcode: '8900000000042', mrp: 30 },
  { brand: 'Telma 40', ingredients: [telmisartan(40)], form: 'tablet', barcode: '8900000000059', mrp: 92 },
  { brand: 'Atorva 10', ingredients: [atorvastatin(10)], form: 'tablet', barcode: '8900000000066', mrp: 95 },
  { brand: 'Jan Aushadhi Amlodipine 5', ingredients: [amlodipine(5)], form: 'tablet', barcode: '8900000000073', mrp: 8, janAushadhi: true },
  { brand: 'Jan Aushadhi Metformin 500', ingredients: [metformin(500)], form: 'tablet', barcode: '8900000000080', mrp: 10, janAushadhi: true },
  { brand: 'Jan Aushadhi Telmisartan 40', ingredients: [telmisartan(40)], form: 'tablet', barcode: '8900000000097', mrp: 16, janAushadhi: true },
  { brand: 'Jan Aushadhi Atorvastatin 10', ingredients: [atorvastatin(10)], form: 'tablet', barcode: '8900000000103', mrp: 12, janAushadhi: true },
]
