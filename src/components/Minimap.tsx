import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { flyTo, useCityState, whereAmI } from '../showcase/cityStore'
import { useIssueState } from '../showcase/issueStore'
import { ISSUE_COLOR } from '../showcase/scene/IssueLayer'

/** Minimap size in CSS pixels. */
const SIZE = 168
/** Below this camera distance, the label names the street you are on. */
const ZOOMED_IN = 40
const LOGO_BLUE = '#1488ff'

type Props = {
  /** Shown when zoomed out: the town or loaded city. */
  placeLabel: string
}

/**
 * North-up minimap of the city around the view, with an arrow for where
 * the camera looks. Click to fly there. Above it, a one-line "where am I".
 */
export function Minimap({ placeLabel }: Props) {
  const { map, pose } = useCityState()
  const { issues, fixed, selectedId } = useIssueState()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Scene units across the minimap: tight when close, wider when zoomed out.
  const span = Math.min(240, Math.max(45, pose.distance * 1.4))

  const paths = useMemo(
    () =>
      map
        ? {
            roads: new Path2D(map.roads),
            walks: new Path2D(map.walks),
            buildings: new Path2D(map.buildings),
          }
        : null,
    [map],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== SIZE * dpr) {
      canvas.width = SIZE * dpr
      canvas.height = SIZE * dpr
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#16231f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (!paths) return

    // Scene units → pixels, centered on the view.
    const scale = (SIZE * dpr) / span
    ctx.setTransform(scale, 0, 0, scale, (SIZE * dpr) / 2 - pose.x * scale, (SIZE * dpr) / 2 - pose.z * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = 'rgba(150, 190, 210, 0.55)'
    ctx.fill(paths.buildings)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 0.4
    ctx.stroke(paths.walks)
    ctx.strokeStyle = '#e9f1f4'
    ctx.lineWidth = 1.3
    ctx.stroke(paths.roads)

    // Issues: a dot each, green once improved, ringed when selected.
    const dot = 3.2 / (scale / dpr)
    for (const issue of issues) {
      if (Math.abs(issue.x - pose.x) > span || Math.abs(issue.z - pose.z) > span) continue
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
    ctx.setTransform(dpr, 0, 0, dpr, (SIZE * dpr) / 2, (SIZE * dpr) / 2)
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
  }, [paths, pose, span, issues, fixed, selectedId])

  const here = map ? whereAmI(map, pose.x, pose.z) : null
  const zoomed = pose.distance < ZOOMED_IN
  const where =
    zoomed && here && (here.street || here.place)
      ? [here.street, here.place && `near ${here.place}`].filter(Boolean).join(' · ')
      : placeLabel

  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * SIZE
    const py = ((event.clientY - rect.top) / rect.height) * SIZE
    flyTo(pose.x + ((px - SIZE / 2) * span) / SIZE, pose.z + ((py - SIZE / 2) * span) / SIZE)
  }

  return (
    <section className="minimap" aria-label="Map of the city">
      <p className="minimap__where" role="status">
        {where}
      </p>
      <div className="minimap__frame">
        <canvas
          ref={canvasRef}
          className="minimap__canvas"
          style={{ width: SIZE, height: SIZE }}
          onClick={onClick}
          title="Click to go there"
          aria-label="Minimap. Click a spot to fly there."
        />
        <span className="minimap__north" aria-hidden="true">
          N
        </span>
      </div>
    </section>
  )
}
