/**
 * The OpenStreetMap (Overpass) queries the city is built from, shared by the
 * browser and the API. Both must build byte-identical query text: the API
 * caches answers by that text, and pre-loads major cities with it.
 */

/** Half-size of one downloaded area in degrees: about 1.4 km across. */
export const TILE_HALF = 0.0065
/**
 * Coastline is searched wider than one street tile. A city on the coast
 * still gets the ocean when its center sits a few kilometers inland.
 * About 12 km across.
 */
export const COAST_HALF = 0.055
/**
 * Landmark bridges are searched wider still, about 20 km across, so the
 * Golden Gate and the Bay Bridge stand on the skyline from downtown.
 */
export const LANDMARK_HALF = 0.09

/** Areas snap to a grid, so nearby requests share one download (and one cache entry). */
export function tileKey(lng: number, lat: number) {
  return `${Math.round(lng / (TILE_HALF * 2))}:${Math.round(lat / (TILE_HALF * 2))}`
}

/**
 * Center of a grid tile, as [longitude, latitude]. Downloading the box
 * around this point covers exactly that tile, so neighbors meet edge to
 * edge with no gap and no overlap.
 */
export function tileCenter(key: string): [number, number] {
  const [x, y] = key.split(':').map(Number)
  return [(x ?? 0) * TILE_HALF * 2, (y ?? 0) * TILE_HALF * 2]
}

function box(lng: number, lat: number, half: number) {
  // Fixed precision, so the same tile always gives the same text.
  const f = (v: number) => v.toFixed(6)
  return `${f(lat - half)},${f(lng - half)},${f(lat + half)},${f(lng + half)}`
}

/**
 * Track, platforms, and station nodes, plus one "railref" row per track way
 * and route relation, carrying that relation's colour, ref, and network.
 */
function railQuery(b: string) {
  return `way["railway"~"^(rail|subway|light_rail|tram|monorail|narrow_gauge|funicular)$"](${b})->.rail;.rail out tags geom 600;way["railway"="platform"](${b});out tags geom 150;node["railway"~"^(station|halt|tram_stop|subway_entrance)$"](${b});out body 250;foreach.rail->.w(rel(bw.w)["route"~"^(subway|light_rail|train|tram|monorail)$"]->.rr;foreach.rr->.r(make railref way=w.u(id()),colour=r.u(t["colour"]),ref=r.u(t["ref"]),network=r.u(t["network"]);out;););`
}

/** Real streets, buildings, water, bridges, and rail in one grid tile. */
export function tileQuery(key: string) {
  const [lng, lat] = tileCenter(key)
  const b = box(lng, lat, TILE_HALF)
  // Streets, buildings, landmark pieces, and water get separate quotas.
  // Some landmarks (SF City Hall) map their outline and lower floors as
  // relations, so building relations are asked for too.
  return `[out:json][timeout:60];way["highway"](${b});out tags geom 2500;way["building"](${b});out tags geom 4000;way["building:part"](${b});out tags geom 5000;relation["building:part"](${b});out tags geom 400;relation["building"](${b});out tags geom 600;way["natural"="water"](${b});out tags geom 400;way["natural"="bay"](${b});out tags geom 80;way["natural"="coastline"](${b});out tags geom 400;way["waterway"~"^(river|stream|canal|riverbank)$"](${b});out tags geom 800;relation["natural"="water"](${b});out tags geom 60;relation["natural"="bay"](${b});out tags geom 20;relation["natural"="coastline"](${b});out tags geom 40;relation["waterway"="riverbank"](${b});out tags geom 40;way["man_made"="bridge"](${b});out tags geom 80;relation["man_made"="bridge"](${b});out tags geom 20;way["natural"~"^(beach|sand)$"](${b});out tags geom 150;relation["natural"~"^(beach|sand)$"](${b});out tags geom 20;${railQuery(b)}`
}

/** Ocean shoreline around a tile: wider than the tile, coastline only. */
export function coastQuery(key: string) {
  const [lng, lat] = tileCenter(key)
  const b = box(lng, lat, COAST_HALF)
  return `[out:json][timeout:40];way["natural"="coastline"](${b});out tags geom 1500;relation["natural"="coastline"](${b});out tags geom 30;`
}

/** The big bridges around a tile: long road bridges and large bridge outlines. */
export function landmarkQuery(key: string) {
  const [lng, lat] = tileCenter(key)
  const b = box(lng, lat, LANDMARK_HALF)
  return `[out:json][timeout:40];way["highway"~"^(motorway|trunk|primary)$"]["bridge"]["bridge"!="no"](${b})(if:length()>200);out tags geom 300;way["man_made"="bridge"](${b})(if:length()>600);out tags geom 60;relation["man_made"="bridge"](${b});out tags geom 30;`
}

/** Every query a place's first view needs, in the order it needs them. */
export function firstViewQueries(lng: number, lat: number): string[] {
  const key = tileKey(lng, lat)
  return [tileQuery(key), coastQuery(key), landmarkQuery(key)]
}

/** The tiles in a square ring `radius` tiles around a place (radius 1: the 8 neighbours). */
export function ringTiles(lng: number, lat: number, radius: number): string[] {
  const [x, y] = tileKey(lng, lat).split(':').map(Number) as [number, number]
  const out: string[] = []
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) out.push(`${x + dx}:${y + dy}`)
    }
  }
  return out
}

/**
 * Places judges and visitors are likely to type, pre-loaded by the API.
 * The API geocodes each name the same way the address bar does.
 */
export const MAJOR_CITIES = [
  'Boston, MA',
  'Cambridge, MA',
  'New York, NY',
  'San Francisco, CA',
  'Los Angeles, CA',
  'Chicago, IL',
  'Seattle, WA',
  'Washington, DC',
  'Philadelphia, PA',
  'Miami, FL',
  'Hollywood, FL',
  'Fort Lauderdale, FL',
  'Austin, TX',
  'Dallas, TX',
  'Las Vegas, NV',
  'Portland, ME',
  'Portland, OR',
  'Atlanta, GA',
] as const
