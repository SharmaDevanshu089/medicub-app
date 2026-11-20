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
}

const amlodipine = (mg: number): Ingredient => ({ name: 'amlodipine', mg, drugClass: 'Calcium channel blocker' })
const telmisartan = (mg: number): Ingredient => ({ name: 'telmisartan', mg, drugClass: 'ARB' })

export const CATALOG: Product[] = [
  { brand: 'Amlong 5', ingredients: [amlodipine(5)], form: 'tablet', barcode: '8900000000011' },
  { brand: 'Telma-AM 40/5', ingredients: [telmisartan(40), amlodipine(5)], form: 'tablet', barcode: '8900000000028' },
  { brand: 'Stamlo 5', ingredients: [amlodipine(5)], form: 'tablet', barcode: '8900000000035' },
  { brand: 'Glycomet 500', ingredients: [{ name: 'metformin', mg: 500, drugClass: 'Biguanide' }], form: 'tablet', barcode: '8900000000042' },
  { brand: 'Telma 40', ingredients: [telmisartan(40)], form: 'tablet', barcode: '8900000000059' },
  { brand: 'Atorva 10', ingredients: [{ name: 'atorvastatin', mg: 10, drugClass: 'Statin' }], form: 'tablet', barcode: '8900000000066' },
]
