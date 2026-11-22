import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { decideAddressQuery } from '../data/addressQuery'
import { loadUsNeighborhood, type LoadedNeighborhood } from '../data/overpass'
import {
  geocodeUsPlace,
  mergePlaceSuggestions,
  suggestAddresses,
  suggestUsCities,
  type CitySuggestion,
} from '../data/places'
import { flyTo, setPin, useCitySelector } from '../showcase/cityStore'
import './place-search.css'

/** "Clapp Library, 106 Central St, Wellesley, MA…" → "Clapp Library" */
const shortName = (label: string) => label.split(',')[0]?.trim() || label

type PendingPin = { lng: number; lat: number; label: string }

/**
 * One address bar. A city or town keeps the city view. A street address
 * already in that city flies the camera there. An address somewhere else
 * loads those streets, then flies. Wellesley stays until the query is
 * somewhere else.
 */
export function AddressBar({ onLoad }: { onLoad: (neighborhood: LoadedNeighborhood) => void }) {
  const map = useCitySelector((state) => state.map)
  const town = useCitySelector((state) => state.town)
  const ids = useId()
  const inputId = `${ids}-input`
  const listId = `${ids}-list`
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const picked = useRef<string | null>(null)
  const submitted = useRef(false)
  const pending = useRef<PendingPin | null>(null)

  useEffect(() => {
    const want = pending.current
    if (!map || !want) return
    const decision = decideAddressQuery(
      { label: want.label, lng: want.lng, lat: want.lat, addrType: 'StreetAddress' },
      map.geoBounds,
      town,
    )
    if (decision !== 'focus') return
    pending.current = null
    const [x, z] = map.project(want.lng, want.lat)
    setPin({ label: want.label, x, z })
    flyTo(x, z, { distance: 16 })
    setStatus('')
  }, [map, town])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2 || picked.current === query) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      Promise.all([
        suggestUsCities(text, controller.signal),
        suggestAddresses(text, controller.signal),
      ])
        .then(([cities, addresses]) => {
          if (submitted.current) return
          setSuggestions(mergePlaceSuggestions(text, cities, addresses))
          setActive(-1)
          setOpen(true)
        })
        .catch(() => {
          // Aborted or offline: Enter still tries the typed text.
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const go = async (text: string, magicKey?: string) => {
    if (busy || text.trim().length < 2) return
    submitted.current = true
    setOpen(false)
    setBusy(true)
    try {
      const place = await geocodeUsPlace(text, magicKey)
      if (!place) {
        setStatus('No place matched that.')
        return
      }
      const decision = decideAddressQuery(place, map?.geoBounds ?? null, town)
      if (decision === 'keep-city') {
        pending.current = null
        setStatus('')
        return
      }
      if (decision === 'load-city') {
        pending.current = null
        setPin(null)
        setStatus('Loading its real streets from OpenStreetMap.')
        const loaded = await loadUsNeighborhood(text, magicKey)
        onLoad(loaded)
        setStatus(loaded.note)
        return
      }
      const label = shortName(place.label)
      if (decision === 'focus' && map) {
        pending.current = null
        const [x, z] = map.project(place.lng, place.lat)
        setPin({ label, x, z })
        flyTo(x, z, { distance: 16 })
        setStatus('')
        return
      }
      setStatus('Loading the streets around that address.')
      pending.current = { lng: place.lng, lat: place.lat, label }
      const loaded = await loadUsNeighborhood(text, magicKey)
      onLoad(loaded)
    } catch {
      pending.current = null
      setStatus('Address search failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const pick = (choice: CitySuggestion) => {
    const shown = shortName(choice.label)
    picked.current = shown
    setQuery(shown)
    setSuggestions([])
    void go(choice.label, choice.magicKey)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    // Enter uses a suggestion only after the arrow keys highlight one.
    // Otherwise the typed text is what gets geocoded, so a house number
    // is not replaced by a nearby street name.
    const choice = open && active >= 0 ? suggestions[active] : undefined
    if (choice) pick(choice)
    else void go(query)
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

  // Closing the note hands focus back to the field, not to the page.
  const closeStatus = () => {
    setStatus('')
    document.getElementById(inputId)?.focus()
  }

  return (
    <form className="place-search" role="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        Address
      </label>
      <div className="place-search__row">
        <div className="place-search__field">
          <input
            id={inputId}
            className="place-search__input"
            value={query}
            placeholder={busy ? 'Finding…' : 'Address or city'}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
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
            aria-label="Matching places"
            className={`place-search__list${showList ? ' is-open' : ''}`}
          >
            {suggestions.map((choice, index) => (
              <li
                key={choice.magicKey}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`place-search__option${index === active ? ' is-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(choice)}
              >
                {choice.label.replace(/, USA$/, '')}
              </li>
            ))}
          </ul>
        </div>
        <button type="submit" className="place-search__go" disabled={busy || query.trim().length < 2}>
          {busy ? 'Finding' : 'Go'}
        </button>
      </div>
      {/* The place note ("… OpenStreetMap: N streets …"). × closes it; the
          next place loaded sets a new note and it shows again. */}
      <div className={`place-search__status${status && !showList ? ' is-shown' : ''}`}>
        <p className="place-search__status-text" role="status">
          {status}
        </p>
        {status && (
          <button
            type="button"
            className="place-search__status-close"
            aria-label="Close place details"
            onClick={closeStatus}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeStatus()
            }}
          >
            ×
          </button>
        )}
      </div>
    </form>
  )
}
