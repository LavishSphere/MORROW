import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { loadUsNeighborhood, type LoadedNeighborhood } from '../data/overpass'
import { suggestUsCities, type CitySuggestion } from '../data/places'
import './place-search.css'

type Props = {
  onLoad: (neighborhood: LoadedNeighborhood) => void
}

const HINT = 'Type a US city. A procedural city is built around it. Wellesley stays the checked-in scenario.'

/** "Springfield, IL, USA" → "Springfield, IL" */
const displayName = (label: string) => label.replace(/, USA$/, '')

/**
 * One-line city search. As you type, matching US cities come back from the
 * same Esri geocoder the loader uses; pick one (mouse or arrow keys + Enter)
 * to load it. Status notes float under the field so the top bar stays one row.
 */
export function PlaceSearch({ onLoad }: Props) {
  const ids = useId()
  const inputId = `${ids}-input`
  const listId = `${ids}-list`
  const hintId = `${ids}-hint`

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  // Skip the lookup that would otherwise fire when a pick fills the field.
  const picked = useRef<string | null>(null)
  // Once a load starts, late suggestions must not reopen the list.
  const submitted = useRef(false)

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2 || picked.current === query) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      suggestUsCities(text, controller.signal)
        .then((next) => {
          if (submitted.current) return
          setSuggestions(next)
          setActive(-1)
          setOpen(true)
        })
        .catch(() => {
          // Aborted or offline: keep the field usable with a plain Load.
        })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const load = async (text: string, magicKey?: string) => {
    if (busy || text.trim().length < 2) return
    submitted.current = true
    setOpen(false)
    setBusy(true)
    setStatus('Building a procedural city around that place.')
    try {
      const loaded = await loadUsNeighborhood(text, magicKey)
      onLoad(loaded)
      setStatus(loaded.note)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Place search failed.')
    } finally {
      setBusy(false)
    }
  }

  const pick = (choice: CitySuggestion) => {
    const shown = displayName(choice.label)
    picked.current = shown
    setQuery(shown)
    setSuggestions([])
    void load(choice.label, choice.magicKey)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const choice = open ? suggestions[active] : undefined
    if (choice) pick(choice)
    else void load(query)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!suggestions.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + suggestions.length) % suggestions.length)
    }
  }

  const showList = open && suggestions.length > 0

  return (
    <form className="place-search" role="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        US city
      </label>
      <div className="place-search__row">
        <div className="place-search__field">
          <input
            id={inputId}
            className="place-search__input"
            value={query}
            placeholder="Search a US city"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={hintId}
            aria-activedescendant={
              showList && active >= 0 ? `${listId}-${active}` : undefined
            }
            onChange={(event) => {
              picked.current = null
              submitted.current = false
              setQuery(event.target.value)
              setStatus('')
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (suggestions.length) setOpen(true)
            }}
            onBlur={() => setOpen(false)}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching US cities"
            className={`place-search__list${showList ? ' is-open' : ''}`}
          >
            {suggestions.map((choice, index) => (
              <li
                key={choice.magicKey}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`place-search__option${index === active ? ' is-active' : ''}`}
                // Keep focus in the input so blur does not close the list first.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(choice)}
              >
                {displayName(choice.label)}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="submit"
          className="place-search__go"
          disabled={busy || query.trim().length < 2}
        >
          {busy ? 'Loading' : 'Load'}
        </button>
      </div>
      <p id={hintId} className="sr-only">
        {HINT}
      </p>
      <p
        className={`place-search__status${status && !showList ? ' is-shown' : ''}`}
        role="status"
      >
        {status}
      </p>
    </form>
  )
}
