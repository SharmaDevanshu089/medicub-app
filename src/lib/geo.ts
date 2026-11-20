export interface LatLng {
  lat: number
  lng: number
}

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Operational geofence radius around a registered clinic (not a clinical value). */
export const GEOFENCE_M = 150

export const insideFence = (here: LatLng, clinic: LatLng, radius = GEOFENCE_M) => distanceM(here, clinic) <= radius
