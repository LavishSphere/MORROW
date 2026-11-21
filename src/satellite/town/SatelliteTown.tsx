import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SatelliteStage } from '../camera/SatelliteStage'
import { useTownCamera } from '../camera/useTownCamera'
import {
  EMPTY_DETECTION,
  type AiDetection,
  type PinsModule,
  type StatsModule,
} from './contract'
import curbUrl from './curb.jpg'
import rampUrl from './ramp.jpg'
import './town.css'

const pinModules = import.meta.glob<PinsModule>('../pins/index.ts', {
  eager: true,
})
const statsModules = import.meta.glob<StatsModule>('../stats/index.ts', {
  eager: true,
})

const pinsModule = Object.values(pinModules)[0]
const statsModule = Object.values(statsModules)[0]

type Props = {
  reducedMotion: boolean
}

/**
 * Town satellite. Markers and "See next problem" come from the AI detection
 * pass in src/satellite/pins. The Gemini cost estimate stays in
 * src/satellite/stats. This view only flies the camera and draws the frame.
 */
export function SatelliteTown({ reducedMotion }: Props) {
  return (
    <DetectionBridge>
      {(detection) => <TownFrame detection={detection} reducedMotion={reducedMotion} />}
    </DetectionBridge>
  )
}

function DetectionBridge({ children }: { children: (detection: AiDetection) => ReactNode }) {
  if (!pinsModule) return children(EMPTY_DETECTION)
  return <DetectionHost>{children}</DetectionHost>
}

function DetectionHost({ children }: { children: (detection: AiDetection) => ReactNode }) {
  const detection = pinsModule.useAiDetection()
  return children(detection)
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
  const Stats = statsModule?.SatelliteStats

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

      <header className="satellite-town__bar">
        <div>
          <p className="satellite-town__mark">MORROW</p>
          <p className="satellite-town__source">
            {detection.sourceLabel || 'Problems detected by AI'}
          </p>
        </div>
        <button
          type="button"
          className="satellite-town__next"
          onClick={detection.seeNextProblem}
          disabled={detection.phase !== 'ready' || detection.problems.length === 0}
        >
          See next problem
        </button>
      </header>

      <p className="satellite-town__live" role="status">
        {detection.phase === 'running'
          ? 'AI detection is looking for problems.'
          : detection.phase === 'unavailable'
            ? 'AI detection is not connected.'
            : selected
              ? `${selected.title}. ${placesLeft} other problems detected.`
              : 'No problems detected.'}
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
        <div className="satellite-town__stats">
          {Stats ? <Stats problemId={detection.selectedId} /> : null}
        </div>
      </section>

      <p className="satellite-town__credit">
        Imagery © Esri, Maxar, Earthstar Geographics
      </p>
    </div>
  )
}
