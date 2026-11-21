import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('each mode has its own page', async () => {
  const app = await readFile('src/App.tsx', 'utf8')
  // Canvas only: no Canvas / List toggle.
  assert.equal(app.includes('ListFallback'), false)
  assert.equal(app.includes('surfaceView'), false)
  // One CanvasSlot, so switching modes never remounts the city.
  assert.equal(app.match(/<CanvasSlot/g)?.length, 1)
  assert.match(app, /<CanvasSlot/)
  assert.match(app, /panelMode === 'improve' &&/)
  assert.match(app, /<ImprovePage/)
  assert.match(app, /panelMode === 'compare' && <CompareSheet \/>/)
  assert.match(app, /panelMode === 'propose' && <ProposeSheet \/>/)
  assert.equal(app.includes('<ContextPanel'), false)
})
