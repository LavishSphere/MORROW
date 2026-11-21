import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import demoDataset from '../../../data/wellesley/demo-dataset.json'
import { compareByIds } from '../../data/compare'
import { LogoMark } from '../../brand/LogoMark'
import { SatelliteStage } from '../camera/SatelliteStage'
import { useTownCamera } from '../camera/useTownCamera'
import {
  type AiDetection,
  type AiDetectedProblem,
  type PinsModule,
} from './contract'
import curbUrl from './curb.jpg'
import rampUrl from './ramp.jpg'
import './town.css'

const pinModules = import.meta.glob<PinsModule>('../pins/index.ts', {
  eager: true,
})

const pinsModule = Object.values(pinModules)[0]

/** The checked-in Wellesley barrier. Not a model finding. */
function illustrativeDetection(): AiDetection {
  const barrier = demoDataset.barriers[0]
  const [longitude, latitude] = barrier.coordinates
  const problem: AiDetectedProblem = {
    id: barrier.id,
    longitude,
    latitude,
    title: barrier.locationLabel,
  }
  return {
    phase: 'ready',
    problems: [problem],
    selectedId: problem.id,
    seeNextProblem() {},
    selectProblem() {},
    sourceLabel: 'Illustrative Wellesley scenario, not an AI detection',
  }
}

function formatMeters(meters: number | null): string {
  if (meters === null) return 'unreachable'
  return `${Math.round(meters)} m`
}

function detectionFromPins(): AiDetection | null {
  if (typeof pinsModule?.useAiDetection !== 'function') return null
  return pinsModule.useAiDetection()
}

type Props = {
  reducedMotion: boolean
}

/**
 * Town satellite. The pin is the checked-in Wellesley barrier unless a pins
 * module actually exports detection. The caption stays visible when the
 * full-bleed layout hides the header bar.
 */
export function SatelliteTown({ reducedMotion }: Props) {
  return (
    <DetectionBridge>
      {(detection) => <TownFrame detection={detection} reducedMotion={reducedMotion} />}
    </DetectionBridge>
  )
}

function DetectionBridge({ children }: { children: (detection: AiDetection) => ReactNode }) {
  const fromPins = detectionFromPins()
  return children(fromPins ?? illustrativeDetection())
}

function TownFrame({
  detection,
  reducedMotion,
}: {
  detection: AiDetection
  reducedMotion: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setViewport((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const selected =
    detection.problems.find((problem) => problem.id === detection.selectedId) ?? null
  const frame = useTownCamera(
    selected ? { lng: selected.longitude, lat: selected.latitude } : null,
    reducedMotion,
    viewport,
  )
  const placesLeft = detection.problems.filter(
    (problem) => problem.id !== detection.selectedId,
  ).length
  const modeled = useMemo(() => {
    try {
      return compareByIds({
        scenarioId: demoDataset.scenario.id,
        interventionId: demoDataset.scenario.interventionId,
      })
    } catch {
      return null
    }
  }, [])

  return (
    <div className="satellite-town" ref={rootRef}>
      <SatelliteStage frame={frame}>
        {(project) => (
          <>
            {detection.problems.map((problem) => {
              const point = project(problem.longitude, problem.latitude)
              const isSelected = problem.id === detection.selectedId
              return (
                <button
                  key={problem.id}
                  type="button"
                  className={`satellite-pin${isSelected ? ' is-selected' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  aria-label={problem.title}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => detection.selectProblem(problem.id)}
                >
                  <span className="satellite-pin__diamond" />
                </button>
              )
            })}
            {selected ? (
              <svg className="satellite-town__leader" aria-hidden="true">
                <line
                  x1={project(selected.longitude, selected.latitude).x}
                  y1={project(selected.longitude, selected.latitude).y + 22}
                  x2={viewport.width / 2}
                  y2={Math.max(96, viewport.height - 210)}
                  stroke="#1488FF"
                  strokeWidth="3"
                />
              </svg>
            ) : null}
          </>
        )}
      </SatelliteStage>

      <header className="satellite-town__bar flex items-center justify-center text-center">
        <p className="satellite-town__mark">
          <LogoMark decorative className="satellite-town__mark-shape" />
          <span>MORROW</span>
        </p>
        <button
          type="button"
          className="satellite-town__next"
          onClick={detection.seeNextProblem}
          disabled={detection.phase !== 'ready' || detection.problems.length === 0}
        >
          See next problem
        </button>
      </header>

      <div className="satellite-town__notes">
        <p className="satellite-town__source">
          {detection.sourceLabel || 'Illustrative Wellesley scenario'}
        </p>
        <p className="satellite-town__meters">
          {modeled
            ? `Modeled route ${formatMeters(modeled.beforeMeters)} → ${formatMeters(modeled.afterMeters)}. Not a Gemini estimate.`
            : 'Modeled route unavailable.'}
        </p>
        <p className="satellite-town__credit">
          Imagery © Esri, Maxar, Earthstar Geographics
        </p>
      </div>

      <p className="satellite-town__caption">
        {detection.sourceLabel || 'Illustrative Wellesley scenario'}
        {selected ? ` · ${selected.title}` : ''}
      </p>

      <p className="satellite-town__live" role="status">
        {detection.phase === 'running'
          ? 'AI detection is looking for problems.'
          : detection.phase === 'unavailable'
            ? 'No live detection. Showing the illustrative Wellesley barrier.'
            : selected
              ? placesLeft > 0
                ? `${selected.title}. ${placesLeft} other places in view.`
                : selected.title
              : 'No barrier selected.'}
      </p>

      <section className="satellite-town__card" aria-label="Selected problem">
        <div className="satellite-town__photos">
          <figure>
            <img src={curbUrl} alt="Vertical curb blocking the crosswalk" />
            <figcaption>
              Before
              <span>Curb</span>
            </figcaption>
          </figure>
          <figure>
            <img src={rampUrl} alt="Curb cut as a ramp into the crosswalk" />
            <figcaption>
              After
              <span>Ramp</span>
            </figcaption>
          </figure>
        </div>
      </section>
    </div>
  )
}
