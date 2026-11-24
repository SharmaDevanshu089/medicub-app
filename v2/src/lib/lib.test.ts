import { expect, it } from 'vitest'
import { distanceM, insideFence } from './geo'
import { namesMatch, nmcLookup } from '../services/verification'

it('geofence: ~100 m inside, ~1 km outside', () => {
  const clinic = { lat: 12.9116, lng: 77.6474 }
  expect(insideFence({ lat: 12.9125, lng: 77.6474 }, clinic)).toBe(true)
  expect(distanceM({ lat: 12.9206, lng: 77.6474 }, clinic)).toBeGreaterThan(900)
  expect(insideFence({ lat: 12.9206, lng: 77.6474 }, clinic)).toBe(false)
})

it('name matching ignores titles and case', () => {
  expect(namesMatch('Dr. Kavya  Nair', 'kavya nair')).toBe(true)
  expect(namesMatch('Kavya Nair', 'Kavya Menon')).toBe(false)
})

it('NMC mock: match, wrong council, name mismatch', async () => {
  expect((await nmcLookup('KMC-2015-55821', 'Karnataka Medical Council', 'Kavya Nair')).status).toBe('pass')
  expect((await nmcLookup('KMC-2015-55821', 'Delhi Medical Council', 'Kavya Nair')).status).toBe('fail')
  expect((await nmcLookup('KMC-2015-55821', 'Karnataka Medical Council', 'Someone Else')).status).toBe('fail')
})
