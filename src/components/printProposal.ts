/** Printable area of a US Letter page with 0.5 in margins, at 96 CSS px per inch. */
const PAGE_WIDTH_PX = 7.5 * 96
const PAGE_HEIGHT_PX = 10 * 96

/**
 * Print only the proposal, on one Letter page.
 *
 * The proposal is copied into its own top-level container (the app, the 3D
 * city, and the overlays are hidden while printing), laid out at the page
 * width with compact print type, measured, and scaled down only if it would
 * spill onto a second page.
 */
export function printProposal() {
  const source = document.getElementById('proposal-print')
  if (!source) {
    window.print()
    return
  }

  document.getElementById('print-root')?.remove()
  const root = document.createElement('div')
  root.id = 'print-root'
  const copy = source.cloneNode(true) as HTMLElement
  copy.removeAttribute('id')
  root.appendChild(copy)
  document.body.appendChild(root)

  root.style.width = `${PAGE_WIDTH_PX}px`
  const height = root.scrollHeight
  const zoom = Math.min(1, PAGE_HEIGHT_PX / Math.max(1, height))
  root.style.setProperty('--print-zoom', zoom.toFixed(3))
  root.style.width = ''
  document.documentElement.classList.add('is-printing-proposal')

  const cleanup = () => {
    root.remove()
    document.documentElement.classList.remove('is-printing-proposal')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
