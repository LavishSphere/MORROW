import { useEffect, useRef, useState } from 'react'
import { TOWN_FRAME, fitTownZoom, lerp } from './project'

export type CameraFrame = {
  lng: number
  lat: number
  zoom: number
  /** True while the imagery is in a zoom-in / zoom-out move. */
  moving: boolean
}

type Target = { lng: number; lat: number } | null

const MOVE_MS = 880

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

/**
 * Top-down camera. A new place eases out, then back in, so the move reads
 * as a zoom without a heavy blur. Reduced motion snaps.
 */
export function useTownCamera(
  target: Target,
  reducedMotion: boolean,
  viewport: { width: number; height: number },
): CameraFrame {
  const fitted = fitTownZoom(viewport.width || 1280, viewport.height || 720)
  const settledZoom = target ? Math.min(18.2, fitted + 1.05) : fitted
  const settledLng = target?.lng ?? TOWN_FRAME.center.lng
  const settledLat = target?.lat ?? TOWN_FRAME.center.lat
  const targetKey = target ? `${target.lng.toFixed(6)},${target.lat.toFixed(6)}` : 'town'

  const [frame, setFrame] = useState<CameraFrame>({
    lng: TOWN_FRAME.center.lng,
    lat: TOWN_FRAME.center.lat,
    zoom: fitted,
    moving: false,
  })
  const frameRef = useRef(frame)
  const seenKey = useRef<string | null>(null)

  useEffect(() => {
    frameRef.current = frame
  })

  useEffect(() => {
    if (viewport.width < 2 || viewport.height < 2) return
    const to = { lng: settledLng, lat: settledLat, zoom: settledZoom }
    const keyChanged = seenKey.current !== null && seenKey.current !== targetKey
    seenKey.current = targetKey
    if (!keyChanged || reducedMotion) {
      setFrame({ ...to, moving: false })
      return
    }

    const from = frameRef.current
    const pull = Math.max(fitted - 0.35, from.zoom - 0.5)
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MOVE_MS)
      const e = ease(t)
      const zoom =
        e < 0.42
          ? lerp(from.zoom, pull, e / 0.42)
          : lerp(pull, to.zoom, (e - 0.42) / 0.58)
      const pos = e < 0.42 ? (e / 0.42) * 0.4 : 0.4 + ((e - 0.42) / 0.58) * 0.6
      setFrame({
        lng: lerp(from.lng, to.lng, pos),
        lat: lerp(from.lat, to.lat, pos),
        zoom,
        moving: t < 0.96,
      })
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [
    fitted,
    reducedMotion,
    settledLat,
    settledLng,
    settledZoom,
    targetKey,
    viewport.height,
    viewport.width,
  ])

  return frame
}
