import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { flyTo, useCityState, whereAmI, type CameraPose } from '../showcase/cityStore'
import { useIssueState, type SceneIssue } from '../showcase/issueStore'
import { ISSUE_COLOR } from '../showcase/scene/IssueLayer'

/** Small minimap size in CSS pixels. */
const SIZE = 168
/** Below this camera distance, the label names the street you are on. */
const ZOOMED_IN = 40
const LOGO_BLUE = '#1488ff'

type Paths = { roads: Path2D; walks: Path2D; buildings: Path2D; water: Path2D }

type View = {
  /** Scene point at the middle of the canvas. */
  cx: number
  cz: number
  /** Scene units across the canvas. */
  span: number
  /** Canvas size in CSS pixels. */
  size: number
}

/** Draw streets, buildings, issues, and the "you are here" arrow. */
function drawMap(
  canvas: HTMLCanvasElement,
  view: View,
  paths: Paths | null,
  issues: SceneIssue[],
  fixed: ReadonlySet<string>,
  selectedId: string | null,
  pose: CameraPose,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const px = Math.round(view.size * dpr)
  if (canvas.width !== px) {
    canvas.width = px
    canvas.height = px
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#16231f'
  ctx.fillRect(0, 0, px, px)
  if (!paths) return

  // Scene units → pixels, centered on the view.
  const scale = px / view.span
  ctx.setTransform(scale, 0, 0, scale, px / 2 - view.cx * scale, px / 2 - view.cz * scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = 'rgba(36, 140, 176, 0.72)'
  ctx.fill(paths.water)
  ctx.fillStyle = 'rgba(150, 190, 210, 0.55)'
  ctx.fill(paths.buildings)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = Math.max(0.4, 0.6 / (scale / dpr))
  ctx.stroke(paths.walks)
  ctx.strokeStyle = '#e9f1f4'
  ctx.lineWidth = Math.max(1.3, 1.6 / (scale / dpr))
  ctx.stroke(paths.roads)

  // Issues: a dot each, green once improved, ringed when selected.
  const dot = 3.2 / (scale / dpr)
  for (const issue of issues) {
    if (Math.abs(issue.x - view.cx) > view.span || Math.abs(issue.z - view.cz) > view.span) continue
    ctx.fillStyle = fixed.has(issue.id) ? '#2ecc71' : ISSUE_COLOR[issue.kind]
    ctx.beginPath()
    ctx.arc(issue.x, issue.z, issue.id === selectedId ? dot * 1.6 : dot, 0, Math.PI * 2)
    ctx.fill()
    if (issue.id === selectedId) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = dot * 0.5
      ctx.stroke()
    }
  }

  // You are here: a soft view cone and an arrow, in screen space.
  const hereX = (pose.x - view.cx) * scale + px / 2
  const hereZ = (pose.z - view.cz) * scale + px / 2
  ctx.setTransform(dpr, 0, 0, dpr, hereX, hereZ)
  ctx.rotate(Math.atan2(pose.dirZ, pose.dirX))
  ctx.fillStyle = 'rgba(20, 136, 255, 0.18)'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, 34, -0.5, 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = LOGO_BLUE
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.lineTo(-5, -5.5)
  ctx.lineTo(-2.5, 0)
  ctx.lineTo(-5, 5.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

/** Canvas pixel → scene point for a view. */
function toScene(event: MouseEvent<HTMLCanvasElement>, view: View) {
  const rect = event.currentTarget.getBoundingClientRect()
  const fx = (event.clientX - rect.left) / rect.width - 0.5
  const fz = (event.clientY - rect.top) / rect.height - 0.5
  return { x: view.cx + fx * view.span, z: view.cz + fz * view.span }
}

/**
 * North-up minimap of the city around the view, with an arrow for where
 * the camera looks; click to fly there. ⤢ opens the whole map, where a
 * click teleports you. Above it, a one-line "where am I".
 */
export function Minimap({ placeLabel }: Props) {
  const { map, pose, loadingMore } = useCityState()
  const { issues, fixed, selectedId } = useIssueState()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bigRef = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState(false)
  const [bigSize, setBigSize] = useState(560)

  const paths = useMemo<Paths | null>(
    () =>
      map
        ? {
            roads: new Path2D(map.roads),
            walks: new Path2D(map.walks),
            buildings: new Path2D(map.buildings),
            water: new Path2D(map.water),
          }
        : null,
    [map],
  )

  // Small map: tight when close, wider when zoomed out.
  const small: View = { cx: pose.x, cz: pose.z, span: Math.min(240, Math.max(45, pose.distance * 1.4)), size: SIZE }
  // Big map: the whole town, with a little margin.
  const big: View | null = map
    ? {
        cx: (map.bounds.minX + map.bounds.maxX) / 2,
        cz: (map.bounds.minZ + map.bounds.maxZ) / 2,
        span: Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ) * 1.06,
        size: bigSize,
      }
    : null

  useEffect(() => {
    if (canvasRef.current) drawMap(canvasRef.current, small, paths, issues, fixed, selectedId, pose)
  })

  useEffect(() => {
    if (open && big && bigRef.current) drawMap(bigRef.current, big, paths, issues, fixed, selectedId, pose)
  })

  useEffect(() => {
    if (!open) return
    const fit = () => setBigSize(Math.floor(Math.min(window.innerWidth * 0.86, window.innerHeight * 0.78, 760)))
    fit()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', fit)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const here = map ? whereAmI(map, pose.x, pose.z) : null
  const zoomed = pose.distance < ZOOMED_IN
  const where = loadingMore
    ? 'Loading more streets…'
    : zoomed && here && (here.street || here.place)
      ? [here.street, here.place && `near ${here.place}`].filter(Boolean).join(' · ')
      : placeLabel

  return (
    <>
      <section className="minimap" aria-label="Map of the city">
        <p className="minimap__where" role="status">
          {where}
        </p>
        <div className="minimap__frame">
          <canvas
            ref={canvasRef}
            className="minimap__canvas"
            style={{ width: SIZE, height: SIZE }}
            onClick={(event) => {
              const spot = toScene(event, small)
              flyTo(spot.x, spot.z)
            }}
            title="Click to go there"
            aria-label="Minimap. Click a spot to fly there."
          />
          <span className="minimap__north" aria-hidden="true">
            N
          </span>
          <button
            type="button"
            className="minimap__expand"
            onClick={() => setOpen(true)}
            aria-label="Open the full map"
            title="Open the full map"
          >
            ⤢
          </button>
        </div>
      </section>

      {open && big && createPortal(
        // Rendered at the page level so it sits above the top bar and mode bar.
        <div className="map-modal" role="dialog" aria-modal="true" aria-label={`Map of ${placeLabel}`} onClick={() => setOpen(false)}>
          <div className="map-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="map-modal__head">
              <p className="map-modal__title">{placeLabel}</p>
              <p className="map-modal__hint">Click anywhere to go there</p>
              <button type="button" className="map-modal__close" onClick={() => setOpen(false)} aria-label="Close the map">
                ×
              </button>
            </div>
            <canvas
              ref={bigRef}
              className="map-modal__canvas"
              style={{ width: big.size, height: big.size }}
              onClick={(event) => {
                const spot = toScene(event, big)
                // Teleport: land there right away, close enough to see the street.
                flyTo(spot.x, spot.z, { instant: true, distance: Math.min(pose.distance, 30) })
                setOpen(false)
              }}
              aria-label="Full map. Click a spot to teleport there."
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

type Props = {
  /** Shown when zoomed out: the town or loaded city. */
  placeLabel: string
}
