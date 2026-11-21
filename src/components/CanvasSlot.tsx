import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import '../showcase/styles.css'
import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
}

/** Isometric holographic city between the top bar and the mode bar. */
export function CanvasSlot({ mode, reducedMotion }: Props) {
  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Holographic neighborhood"
    >
      <ShowcaseCanvas barriers={[]} reducedMotion={reducedMotion} />
      <p className="sr-only">
        Illustrative holographic city. Glass buildings, circuit roads, mixed
        trees. Mode {mode}.
      </p>
    </section>
  )
}
