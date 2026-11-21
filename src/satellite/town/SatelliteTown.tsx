import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import demoDataset from '../../../data/wellesley/demo-dataset.json'
import wellesleyBasemap from '../../../data/wellesley/basemap.geojson'
import { compareByIds } from '../../data/compare'
import type { LoadedNeighborhood, OsmWay } from '../../data/overpass'
import { waysFromBasemap, type BasemapWay } from '../../data/wellesleyBasemap'
import { SatelliteStage } from '../camera/SatelliteStage'
import { formatMeters } from '../stats/format'
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
const wellesleyStreets = waysFromBasemap(wellesleyBasemap)

function streetPath(
  points: [number, number][],
  project: (lng: number, lat: number) => { x: number; y: number },
): string {
  return points
    .map((point, index) => {
      const placed = project(point[0], point[1])
      return `${index === 0 ? 'M' : 'L'}${placed.x} ${placed.y}`
    })
    .join(' ')
}

const CAR_COLORS = ['#f7f4ee', '#1a1a1a', '#d24a3a', '#2c6b4a', '#e2a31b', '#3d5a80']

function polylineLength(
  points: [number, number][],
  project: (lng: number, lat: number) => { x: number; y: number },
): number {
  let total = 0
  let previous = project(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index += 1) {
    const next = project(points[index][0], points[index][1])
    total += Math.hypot(next.x - previous.x, next.y - previous.y)
    previous = next
  }
  return total
}

function poseAlong(
  points: [number, number][],
  project: (lng: number, lat: number) => { x: number; y: number },
  fraction: number,
): { x: number; y: number; angle: number } | null {
  const placed = points.map((point) => project(point[0], point[1]))
  const lengths: number[] = []
  let total = 0
  for (let index = 1; index < placed.length; index += 1) {
    const length = Math.hypot(
      placed[index].x - placed[index - 1].x,
      placed[index].y - placed[index - 1].y,
    )
    lengths.push(length)
    total += length
  }
  if (total < 1) return null
  let remaining = total * Math.min(0.8, Math.max(0.2, fraction))
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    if (remaining <= length || index === lengths.length - 1) {
      const span = length === 0 ? 0 : Math.min(1, remaining / length)
      const from = placed[index]
      const to = placed[index + 1]
      return {
        x: from.x + (to.x - from.x) * span,
        y: from.y + (to.y - from.y) * span,
        angle: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
      }
    }
    remaining -= length
  }
  return null
}

function CarBody({ color }: { color: string }) {
  return (
    <>
      <rect className="satellite-town__car-body" x={-8} y={-3.5} width={16} height={7} rx={2} fill={color} />
      <rect x={-1.5} y={-2.2} width={5} height={4.4} rx={1} fill="rgba(186, 230, 240, 0.9)" />
    </>
  )
}

function StreetLayer({
  ways,
  project,
  reducedMotion,
}: {
  ways: readonly (OsmWay | BasemapWay)[]
  project: (lng: number, lat: number) => { x: number; y: number }
  reducedMotion: boolean
}) {
  const traffic = ways
    .filter((way) => way.kind === 'road' && way.points.length >= 2)
    .map((way) => ({ way, length: polylineLength(way.points, project) }))
    .filter((row) => row.length >= 48)
    .sort((left, right) => right.length - left.length)
    .slice(0, 8)

  return (
    <svg className="satellite-town__streets" aria-hidden="true">
      {ways.map((way) => (
        <path
          key={way.id}
          d={streetPath(way.points, project)}
          className={way.kind === 'building' ? 'satellite-town__building' : 'satellite-town__road'}
        />
      ))}
      {traffic.map((row, index) => {
        const path = streetPath(row.way.points, project)
        const color = CAR_COLORS[index % CAR_COLORS.length]
        if (reducedMotion) {
          const pose = poseAlong(row.way.points, project, 0.25 + (index % 4) * 0.15)
          if (!pose) return null
          return (
            <g
              key={`car-${row.way.id}`}
              className="satellite-town__car"
              transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle})`}
            >
              <CarBody color={color} />
            </g>
          )
        }
        return (
          <g key={`car-${row.way.id}`} className="satellite-town__car">
            <CarBody color={color} />
            <animateMotion
              dur={`${9 + (index % 4) * 2}s`}
              begin={`-${index * 1.4}s`}
              repeatCount="indefinite"
              rotate="auto"
              path={path}
            />
          </g>
        )
      })}
    </svg>
  )
}

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

function detectionFromPins(): AiDetection | null {
  if (typeof pinsModule?.useAiDetection !== 'function') return null
  return pinsModule.useAiDetection()
}

type Props = {
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
}

/**
 * Town satellite. The pin is the checked-in Wellesley barrier unless a pins
 * module actually exports detection. A loaded neighborhood replaces that pin
 * with the OpenStreetMap streets for the place the judge typed.
 */
export function SatelliteTown({ reducedMotion, neighborhood }: Props) {
  return (
    <DetectionBridge>
      {(detection) => (
        <TownFrame
          detection={detection}
          reducedMotion={reducedMotion}
          neighborhood={neighborhood}
        />
      )}
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
  neighborhood,
}: {
  detection: AiDetection
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
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

  const away = neighborhood != null
  const selected = away
    ? null
    : (detection.problems.find((problem) => problem.id === detection.selectedId) ?? null)
  const frame = useTownCamera(
    away
      ? { lng: neighborhood.place.lng, lat: neighborhood.place.lat }
      : selected
        ? { lng: selected.longitude, lat: selected.latitude }
        : null,
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
            <StreetLayer
              ways={away ? neighborhood.ways : wellesleyStreets}
              project={project}
              reducedMotion={reducedMotion}
            />
            {away
              ? null
              : detection.problems.map((problem) => {
              const point = project(problem.longitude, problem.latitude)
              const isSelected = problem.id === detection.selectedId
              return (
                <button
                  key={problem.id}
                  type="button"
                  className={`satellite-pin${isSelected ? ' is-selected' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  aria-label={`Illustrative barrier: ${problem.title}`}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => detection.selectProblem(problem.id)}
                >
                  <span className="satellite-pin__diamond" />
                  {isSelected ? (
                    <span className="satellite-pin__label">{problem.title}</span>
                  ) : null}
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

      <div className="dream-sky" aria-hidden="true" />

      <header className="satellite-town__bar">
        <div>
          <p className="satellite-town__mark">MORROW</p>
          <p className="satellite-town__source">
            {detection.sourceLabel || 'Illustrative Wellesley scenario'}
          </p>
        </div>
        {placesLeft > 0 ? (
          <button
            type="button"
            className="satellite-town__next"
            onClick={detection.seeNextProblem}
          >
            See next problem
          </button>
        ) : null}
      </header>

      <p className="satellite-town__caption">
        {away
          ? neighborhood.note
          : `${detection.sourceLabel || 'Illustrative Wellesley scenario'}${selected ? ` · ${selected.title}` : ''}. Bundled OpenStreetMap streets. Not a barrier inventory.`}
      </p>

      <p className="satellite-town__live" role="status">
        {away
          ? 'No barrier is marked for this place. The streets are not a barrier inventory.'
          : detection.phase === 'running' || detection.phase === 'unavailable'
            ? 'No live detection. Showing the illustrative Wellesley barrier.'
            : selected
              ? selected.title
              : 'No barrier selected.'}
      </p>

      <p className="satellite-town__meters">
        {away
          ? 'No modeled route for this place. The Wellesley distances are not a measurement here.'
          : modeled
            ? `Modeled route ${formatMeters(modeled.beforeMeters)} → ${formatMeters(modeled.afterMeters)}. Not a Gemini estimate.`
            : 'Modeled route unavailable.'}
      </p>

      <section className="satellite-town__card" aria-label="Selected problem">
        <div className="satellite-town__photos">
          <figure>
            <img src={curbUrl} alt="Illustrative photo of a vertical curb" />
            <figcaption>
              Before
              <span>Curb</span>
            </figcaption>
          </figure>
          <figure>
            <img src={rampUrl} alt="Illustrative photo of a curb ramp" />
            <figcaption>
              After
              <span>Ramp</span>
            </figcaption>
          </figure>
        </div>
        <p className="satellite-town__photo-note">
          Illustrative photos, not a site inspection of this location.
        </p>
      </section>

      <p className="satellite-town__credit">
        Imagery © Esri, Maxar, Earthstar Geographics
      </p>
    </div>
  )
}
