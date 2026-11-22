/** Names and dates for the printed proposal letter. */

/** "Wellesley, MA" → "Wellesley". */
export function townName(city: string) {
  return city.split(',')[0]?.trim() || city
}

/** The resident's local date as 2026-11-21 (not UTC, which can be a day off). */
export function localDay(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "MORROW Proposal - Wellesley MA - 2026-11-21": safe as a file name. */
export function proposalFileName(city: string, date = new Date()) {
  const place = city.replace(/[^\p{L}\p{N} .-]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'Town'
  return `MORROW Proposal - ${place} - ${localDay(date)}`
}

/** New England towns are run by a select board; elsewhere, a city council. */
const SELECT_BOARD_STATES = new Set(['MA', 'NH', 'VT', 'ME', 'CT', 'RI'])

export function defaultRecipientFor(city: string) {
  const state = city.split(',')[1]?.trim().toUpperCase() ?? ''
  const board = SELECT_BOARD_STATES.has(state) ? 'Select Board' : 'City Council'
  return `${townName(city)} ${board} and Department of Public Works`
}
