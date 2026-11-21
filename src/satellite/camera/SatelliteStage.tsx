import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TILE_SIZE, lngLatToWorld } from './project'
import type { CameraFrame } from './useTownCamera'
import './camera.css'

const IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

/** Shifts the town up so the before/after card does not cover the center. */
const LIFT = 78

type Project = (lng: number, lat: number) => { x: number; y: number }

type Props = {
  frame: CameraFrame
  children: (project: Project) => ReactNode
}

type Size = { width: number; height: number }

export function SatelliteStage({ frame, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const z = Math.max(0, Math.min(19, Math.floor(frame.zoom)))
  const scale = 2 ** (frame.zoom - z)
  const center = lngLatToWorld(frame.lng, frame.lat, z)
  const originX = size.width / 2 - center.x * scale
  const originY = size.height / 2 - center.y * scale - LIFT
  const tilePx = TILE_SIZE * scale
  const tiles = size.width > 0 ? visibleTiles(originX, originY, size, tilePx, z) : []

  const project: Project = (lng, lat) => {
    const point = lngLatToWorld(lng, lat, frame.zoom)
    const camera = lngLatToWorld(frame.lng, frame.lat, frame.zoom)
    return {
      x: size.width / 2 + (point.x - camera.x),
      y: size.height / 2 + (point.y - camera.y) - LIFT,
    }
  }

  return (
    <div ref={ref} className="satellite-stage">
      <div
        className={`satellite-stage__world${frame.moving ? ' is-moving' : ''}`}
        aria-hidden="true"
      >
        {tiles.map((tile) => (
          <img
            key={`${tile.z}/${tile.x}/${tile.y}`}
            className="satellite-stage__tile"
            alt=""
            draggable={false}
            src={`${IMAGERY}/${tile.z}/${tile.y}/${tile.x}`}
            style={{
              left: originX + tile.x * tilePx,
              top: originY + tile.y * tilePx,
              width: tilePx + 0.5,
              height: tilePx + 0.5,
            }}
          />
        ))}
      </div>
      {size.width > 0 ? children(project) : null}
    </div>
  )
}

function visibleTiles(
  originX: number,
  originY: number,
  size: Size,
  tilePx: number,
  z: number,
): { x: number; y: number; z: number }[] {
  const n = 2 ** z
  const minX = Math.floor(-originX / tilePx) - 1
  const maxX = Math.floor((size.width - originX) / tilePx) + 1
  const minY = Math.max(0, Math.floor(-originY / tilePx) - 1)
  const maxY = Math.min(n - 1, Math.floor((size.height - originY) / tilePx) + 1)
  const tiles: { x: number; y: number; z: number }[] = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push({ x: ((x % n) + n) % n, y, z })
    }
  }
  return tiles
}
