import { useState, type FormEvent } from 'react'
import { loadUsNeighborhood, type LoadedNeighborhood } from '../data/overpass'
import './place-search.css'

type Props = {
  onLoad: (neighborhood: LoadedNeighborhood) => void
  onShowcase: () => void
}

export function PlaceSearch({ onLoad, onShowcase }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Type a US city. Wellesley stays the checked-in scenario.')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus('Looking up that place and asking OpenStreetMap for the neighborhood.')
    try {
      const loaded = await loadUsNeighborhood(query)
      onLoad(loaded)
      setStatus(loaded.note)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Place search failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="place-search" onSubmit={onSubmit}>
      <label className="place-search__label" htmlFor="place-search">
        US city
      </label>
      <div className="place-search__row">
        <input
          id="place-search"
          className="place-search__input"
          value={query}
          placeholder="Greenville, SC"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="place-search__go" disabled={busy || query.trim().length < 2}>
          {busy ? 'Loading' : 'Load'}
        </button>
        <button type="button" className="place-search__back" onClick={onShowcase}>
          Wellesley
        </button>
      </div>
      <p className="place-search__status" role="status">
        {status}
      </p>
    </form>
  )
}
