import { SatelliteTown } from '../satellite/town/SatelliteTown'

type Props = {
  reducedMotion: boolean
}

export function CanvasSlot({ reducedMotion }: Props) {
  return (
    <section className="canvas-slot" aria-label="Satellite view">
      <SatelliteTown reducedMotion={reducedMotion} />
    </section>
  )
}