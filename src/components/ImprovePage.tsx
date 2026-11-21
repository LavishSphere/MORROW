import type { Barrier, Intervention } from '../types'

type Props = {
  barrier: Barrier | null
  interventions: Intervention[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Improve is the intervention list. The map stays on Explore. */
export function ImprovePage({
  barrier,
  interventions,
  selectedId,
  onSelect,
}: Props) {
  return (
    <section
      className="mode-page mx-auto flex w-full max-w-3xl flex-col items-center justify-center"
      aria-label="Intervention options"
    >
      <h2 className="text-center">Options</h2>
      {!barrier ? (
          <p className="mode-page__lead text-center">
            The Wellesley barrier is not loaded yet.
          </p>
      ) : (
        <>
          <p className="mode-page__lead text-center">
            Interventions for <strong>{barrier.locationLabel}</strong>
          </p>
          <ul className="option-list w-full">
            {interventions.map((opt) => {
              const active = opt.id === selectedId
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    className={`option-list__item${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onSelect(opt.id)}
                  >
                    <span className="option-list__name">{opt.description}</span>
                    <span className="option-list__meta">{opt.type}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {interventions.length === 0 && (
            <p className="muted">No interventions for this barrier yet.</p>
          )}
        </>
      )}
    </section>
  )
}
