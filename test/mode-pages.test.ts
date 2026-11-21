import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('each mode has its own page', async () => {
  const app = await readFile('src/App.tsx', 'utf8')
  assert.match(app, /mode === 'explore' && surfaceView === 'canvas'/)
  assert.match(app, /<CanvasSlot/)
  assert.match(app, /mode === 'improve' &&/)
  assert.match(app, /<ImprovePage/)
  assert.match(app, /mode === 'compare' && <CompareSheet \/>/)
  assert.match(app, /mode === 'propose' && <ProposeSheet \/>/)
  assert.equal(app.includes('<ContextPanel'), false)
})
