import type { ReactNode } from 'react'

/**
 * Public surface of src/satellite/pins. That folder is owned by the
 * detection pass. The town view only reads it.
 */
export type AiDetectedProblem = {
  id: string
  longitude: number
  latitude: number
  title: string
  kind?: 'ramp' | 'pothole' | 'sidewalk' | 'crossing'
  beforeLabel?: string
  afterLabel?: string
  beforePhoto?: string
  afterPhoto?: string
}

export type AiDetection = {
  phase: 'running' | 'ready' | 'unavailable'
  problems: readonly AiDetectedProblem[]
  selectedId: string | null
  seeNextProblem: () => void
  selectProblem: (id: string) => void
  sourceLabel: string
}

export type PinsModule = {
  useAiDetection: () => AiDetection
}

/**
 * Public surface of src/satellite/stats. Improvement figures and the
 * Gemini cost estimate stay in that module.
 */
export type StatsModule = {
  SatelliteStats: (props: { problemId: string | null }) => ReactNode
}

export const EMPTY_DETECTION: AiDetection = {
  phase: 'unavailable',
  problems: [],
  selectedId: null,
  seeNextProblem() {},
  selectProblem() {},
  sourceLabel: 'Problems detected by AI',
}
