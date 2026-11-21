export type BasemapWay = {
  id: string
  name: string | null
  kind: 'road' | 'building'
  /** [longitude, latitude] */
  points: [number, number][]
}

function pointsFromCoordinates(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return []
  const points: [number, number][] = []
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const lng = pair[0]
    const lat = pair[1]
    if (typeof lng !== 'number' || typeof lat !== 'number') continue
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    points.push([lng, lat])
  }
  return points
}

/** Roads and building outlines from the bundled Wellesley FeatureCollection. */
export function waysFromBasemap(body: unknown): BasemapWay[] {
  if (!body || typeof body !== 'object') return []
  const features = (body as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const ways: BasemapWay[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as {
      id?: unknown
      geometry?: { type?: unknown; coordinates?: unknown }
      properties?: { name?: unknown; layer?: unknown; osmId?: unknown }
    }
    const geometry = row.geometry
    if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'Polygon')) continue
    const coordinates =
      geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)
        ? geometry.coordinates[0]
        : geometry.coordinates
    const points = pointsFromCoordinates(coordinates)
    if (points.length < 2) continue
    const osmId = row.properties?.osmId
    const id =
      typeof row.id === 'string'
        ? row.id
        : typeof osmId === 'number'
          ? `way/${osmId}`
          : `way-${ways.length}`
    const name = typeof row.properties?.name === 'string' ? row.properties.name : null
    ways.push({
      id,
      name,
      kind: row.properties?.layer === 'building' ? 'building' : 'road',
      points,
    })
  }
  return ways
}
