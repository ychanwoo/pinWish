import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSlides } from '../../scripts/instagram/read-slides.mjs'
const tick = () => new Promise(resolve => setImmediate(resolve))
test('OCR stays at two active calls, preserves slide order and reports actual completions', async () => {
  let active = 0, peak = 0
  const releases = new Map(), progress = []
  const pending = readSlides([1, 2, 3, 4], async (slide) => {
    peak = Math.max(peak, ++active)
    await new Promise(resolve => releases.set(slide, resolve))
    active--
    return `slide ${slide}`
  }, new AbortController().signal, async (done, total) => { progress.push([done, total]) })
  await tick()
  assert.equal(releases.size, 2)
  releases.get(2)(); await tick()
  releases.get(3)(); await tick()
  releases.get(1)(); await tick()
  releases.get(4)()
  assert.deepEqual(await pending, ['slide 1', 'slide 2', 'slide 3', 'slide 4'])
  assert.equal(peak, 2)
  assert.deepEqual(progress, [[1,4],[2,4],[3,4],[4,4]])
})
test('a failed photo aborts siblings, starts no more work and never returns a partial carousel', async () => {
  const started = []
  await assert.rejects(readSlides([1,2,3], async (slide, signal) => {
    started.push(slide)
    if (slide === 1) { await tick(); throw Error('OCR failure') }
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}))
  }, new AbortController().signal), /OCR failure/)
  assert.deepEqual(started, [1,2])
})
test('cancelled OCR starts no paid calls', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readSlides([1,2], async () => assert.fail('unexpected call'), controller.signal))
})
