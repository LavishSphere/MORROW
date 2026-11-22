/**
 * Carriageway width for an OSM centerline.
 * Tagged meters, else lanes times METERS_PER_LANE, else a highway-class prior.
 * METERS_PER_LANE is an assumption, not a survey and not an HPMS lane width.
 * Urban lanes run about 3.0 to 3.3 m; wider ribbons ran into the buildings.
 */
export const METERS_PER_LANE = 3.2

/**
 * A tagged width this far past the lanes is curb to curb plus sidewalks
 * (or a typo), not the carriageway: lanes × METERS_PER_LANE + SLACK.
 */
const TAGGED_LANE_SLACK_METERS = 5
/** Without lanes, a tagged width over this multiple of the class prior is not trusted. */
const TAGGED_PRIOR_LIMIT = 1.6
/** One direction of a divided road with no lane count: part of the two-way prior. */
const ONEWAY_SHARE = 0.6

export type WidthKind = 'tagged' | 'lanes' | 'prior'

export type ResolvedRoadWidth = {
  widthMeters: number
  widthKind: WidthKind
  /** Set only when widthKind is 'lanes'. */
  metersPerLane: number | null
  highway: string | null
  lanes: number | null
  taggedWidthMeters: number | null
}

/** Full carriageway width in meters. A residential street is narrower than a primary. */
export const HIGHWAY_WIDTH_PRIOR_METERS: Record<string, number> = {
  motorway: 14,
  motorway_link: 6,
  trunk: 12,
  trunk_link: 6,
  primary: 11,
  primary_link: 5.5,
  secondary: 9,
  secondary_link: 5,
  tertiary: 7.5,
  tertiary_link: 4.5,
  unclassified: 6.5,
  residential: 6,
  living_street: 4.5,
  service: 3.5,
  busway: 7,
  pedestrian: 4,
  track: 3,
  footway: 1.8,
  sidewalk: 1.8,
  path: 1.2,
  steps: 1,
  cycleway: 1.6,
  bridleway: 2,
  corridor: 2,
}

const DEFAULT_PRIOR_METERS = 6

const FOOT_TO_METERS = 0.3048

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** A single positive number, optionally with an m or ft unit. Anything else is not a measurement. */
export function parseWidthMeters(value: unknown): number | null {
  if (typeof value === 'number') {
    return value > 0 && Number.isFinite(value) ? value : null
  }
  const raw = text(value)
  if (!raw) return null
  const match = /^(\d+(?:\.\d+)?)\s*(m|meter|meters|metre|metres|ft|foot|feet|')?$/i.exec(raw)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2]?.toLowerCase()
  if (unit === 'ft' || unit === 'foot' || unit === 'feet' || unit === "'") {
    return amount * FOOT_TO_METERS
  }
  return amount
}

/** A single positive lane count. "2;3" is not one count. */
export function parseLaneCount(value: unknown): number | null {
  if (typeof value === 'number') {
    return value > 0 && Number.isFinite(value) ? value : null
  }
  const raw = text(value)
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null
  const amount = Number(raw)
  return amount > 0 && Number.isFinite(amount) ? amount : null
}

function highwayClass(tags: Record<string, unknown>): string | null {
  const highway = text(tags.highway)
  if (highway) return highway
  const layer = text(tags.layer)
  if (layer && layer in HIGHWAY_WIDTH_PRIOR_METERS) return layer
  return null
}

function laneTotal(tags: Record<string, unknown>): number | null {
  const lanes = parseLaneCount(tags.lanes)
  if (lanes != null) return lanes
  const forward = parseLaneCount(tags['lanes:forward'])
  const backward = parseLaneCount(tags['lanes:backward'])
  if (forward == null && backward == null) return null
  const total = (forward ?? 0) + (backward ?? 0)
  return total > 0 ? total : null
}

function isOneway(tags: Record<string, unknown>) {
  const oneway = text(tags.oneway)?.toLowerCase()
  return oneway === 'yes' || oneway === '1' || oneway === 'true' || oneway === '-1'
}

export function resolveRoadWidth(tags: Record<string, unknown> | null | undefined): ResolvedRoadWidth {
  const source = tags ?? {}
  const highway = highwayClass(source)
  const lanes = laneTotal(source)
  const taggedWidthMeters = parseWidthMeters(source.width)
  const known = highway ? HIGHWAY_WIDTH_PRIOR_METERS[highway] : undefined
  const twoWayPrior = typeof known === 'number' ? known : DEFAULT_PRIOR_METERS
  const prior = isOneway(source) ? twoWayPrior * ONEWAY_SHARE : twoWayPrior
  const plausible =
    taggedWidthMeters != null &&
    (lanes != null
      ? taggedWidthMeters <= lanes * METERS_PER_LANE + TAGGED_LANE_SLACK_METERS
      : taggedWidthMeters <= prior * TAGGED_PRIOR_LIMIT)
  if (taggedWidthMeters != null && plausible) {
    return {
      widthMeters: taggedWidthMeters,
      widthKind: 'tagged',
      metersPerLane: null,
      highway,
      lanes,
      taggedWidthMeters,
    }
  }
  if (lanes != null) {
    return {
      widthMeters: lanes * METERS_PER_LANE,
      widthKind: 'lanes',
      metersPerLane: METERS_PER_LANE,
      highway,
      lanes,
      taggedWidthMeters,
    }
  }
  return {
    widthMeters: prior,
    widthKind: 'prior',
    metersPerLane: null,
    highway,
    lanes: null,
    taggedWidthMeters,
  }
}
