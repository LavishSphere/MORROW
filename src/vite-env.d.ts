/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for @morrow/api (no trailing slash). Empty = same-origin / Vite proxy. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Parsed GeoJSON FeatureCollection (via vite geojson-as-json plugin). */
declare module '*.geojson' {
  const value: {
    type: 'FeatureCollection'
    features: unknown[]
    [key: string]: unknown
  }
  export default value
}
