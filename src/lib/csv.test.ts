import { expect, it } from 'vitest'
import { parseStockCsv } from './csv'

it('parses valid rows, skips header, reports bad rows', () => {
  const { rows, errors } = parseStockCsv('name,batch,expiry,qty\nTelma 40,TL1,2027-09-30,40\nbad,row\nX,B,2027-01-01,-1')
  expect(rows).toEqual([{ name: 'Telma 40', batch: 'TL1', expiry: '2027-09-30', qty: 40 }])
  expect(errors).toHaveLength(2)
})
