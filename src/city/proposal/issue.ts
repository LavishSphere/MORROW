/** Street issue. Same fields the roads seat exports from `src/city/roads/issues.ts`. */
export type Kind = 'ramp' | 'pothole' | 'sidewalk' | 'crossing'

export type Issue = {
  id: string
  longitude: number
  latitude: number
  title: string
  kind: Kind
  fix: string
}
