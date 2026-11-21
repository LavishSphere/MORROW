import { useLayoutEffect, type RefObject } from 'react'

/**
 * Measures where the floating top bar ends and the mode bar begins, and
 * writes them to `--chrome-top` / `--chrome-bottom` on the shell. Overlays
 * position against these, so they never slide under the bars when the top
 * bar wraps or the window resizes.
 */
export function useChromeInsets(shellRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const topParts = Array.from(
      shell.querySelectorAll<HTMLElement>(
        '.top-bar__brand-block, .top-bar__controls',
      ),
    )
    const modeBar = shell.querySelector<HTMLElement>('.mode-toolbar__track')

    const measure = () => {
      const box = shell.getBoundingClientRect()
      let top = 0
      for (const part of topParts) {
        top = Math.max(top, part.getBoundingClientRect().bottom - box.top)
      }
      const bottom = modeBar
        ? box.bottom - modeBar.getBoundingClientRect().top
        : 0
      shell.style.setProperty('--chrome-top', `${Math.round(top)}px`)
      shell.style.setProperty('--chrome-bottom', `${Math.round(bottom)}px`)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(shell)
    for (const part of topParts) observer.observe(part)
    if (modeBar) observer.observe(modeBar)
    return () => observer.disconnect()
  }, [shellRef])
}
