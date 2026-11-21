/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for @morrow/api (no trailing slash). Empty = same-origin / Vite proxy. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.geojson' {
  const value: unknown
  export default value
}
