import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { geocodeUsPlace, suggestAddresses, type CitySuggestion } from '../data/places'
import { loadUsNeighborhood, type LoadedNeighborhood } from '../data/overpass'
import { flyTo, setPin, useCityState, type CityMap } from '../showcase/cityStore'

/** "Clapp Library, 106 Central St, Wellesley, MA…" → "Clapp Library" */
const shortName = (label: string) => label.split(',')[0]?.trim() || label

/** Degrees of slack around the map edge before an address counts as outside. */
const EDGE = 0.003

type PendingPin = { lng: number; lat: number; label: string }

function insideMap(map: CityMap, lng: number, lat: number) {
  const box = map.geoBounds
  return (
    lng >= box.west - EDGE &&
    lng <= box.east + EDGE &&
    lat >= box.south - EDGE &&
    lat <= box.north + EDGE
  )
}

/**
 * Type an address. If it is already on the map, the camera flies there.
 * Otherwise the real streets around it load from OpenStreetMap and the pin drops
 * once that map is up. Wellesley stays until the address is somewhere else.
 */
export function AddressJump({ onLoad }: { onLoad: (neighborhood: LoadedNeighborhood) => void }) {
  const { map } = useCityState()
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
    if (!map || !want || !insideMap(map, want.lng, want.lat)) return
    pending.current = null
    const [x, z] = map.project(want.lng, want.lat)
    setPin({ label: want.label, x, z })
    flyTo(x, z, { distance: 16 })
    setStatus('')
  }, [map])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 3 || picked.current === query) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      suggestAddresses(text, controller.signal)
        .then((next) => {
          if (submitted.current) return
          setSuggestions(next)
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

  const jump = async (text: string, magicKey?: string) => {
    if (busy || text.trim().length < 3) return
    submitted.current = true
    setOpen(false)
    setBusy(true)
    try {
      const place = await geocodeUsPlace(text, magicKey)
      if (!place) {
        setStatus('No address matched that.')
        return
      }
      const label = shortName(place.label)
      if (map && insideMap(map, place.lng, place.lat)) {
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
    picked.current = shortName(choice.label)
    setQuery(shortName(choice.label))
    setSuggestions([])
    void jump(choice.label, choice.magicKey)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const choice = open ? suggestions[active] : undefined
    if (choice) pick(choice)
    else if (suggestions[0]) pick(suggestions[0])
    else void jump(query)
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
    <form className="place-search place-search--address" role="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        Jump to an address
      </label>
      <div className="place-search__row">
        <div className="place-search__field">
          <input
            id={inputId}
            className="place-search__input"
            value={query}
            placeholder={busy ? 'Finding…' : 'Type an address'}
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
            aria-label="Matching addresses"
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
      </div>
      <p className={`place-search__status${status && !showList ? ' is-shown' : ''}`} role="status">
        {status}
      </p>
    </form>
  )
}
