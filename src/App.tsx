import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'

export default function App() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <div className={`app-shell app-shell--street${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <CanvasSlot reducedMotion={reducedMotion} />
    </div>
  )
}
