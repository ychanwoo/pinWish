import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageDimensions, fetchModelImage } from '../../scripts/instagram/model-images.mjs'
function jpeg(width, height, length = 100) {
  const bytes = Buffer.alloc(length)
  bytes.set([0xff,0xd8,0xff,0xc0,0,17,8], 0)
  bytes.writeUInt16BE(height,7); bytes.writeUInt16BE(width,9)
  return { bytes, format: 'jpeg' }
}
test('reads bounded JPEG/PNG dimensions and rejects truncated headers', () => {
  assert.deepEqual(imageDimensions(jpeg(1080,1350).bytes,'jpeg'),{width:1080,height:1350})
  assert.equal(imageDimensions(Buffer.from([255,216,255,192,0,17]),'jpeg'),null)
  const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.writeUInt32BE(1080,16);png.writeUInt32BE(1350,20)
  assert.deepEqual(imageDimensions(png,'png'),{width:1080,height:1350})
})
test('selects a readable full-slide variant instead of an oversized original', async () => {
  const variants={original:jpeg(3277,4096,1000),square:jpeg(1080,1080),small:jpeg(320,400),good:jpeg(1080,1350)}
  const result=await fetchModelImage({url:'original',alternatives:['square','small','good']},{fetchImage:async url=>variants[url]})
  assert.equal(result,variants.good)
})
test('preserves original when alternatives fail or would crop; never tries more than three', async () => {
  const original=jpeg(3277,4096,1000);const calls=[]
  const result=await fetchModelImage({url:'original',alternatives:['bad','crop','small','fourth']},{fetchImage:async url=>{calls.push(url);if(url==='original')return original;if(url==='bad')throw Error('unavailable');return jpeg(400,400)}})
  assert.equal(result,original);assert.equal(calls.length,4)
})
test('does not redownload variants for already suitable images and respects cancellation', async () => {
  const original=jpeg(1080,1350);let calls=0
  assert.equal(await fetchModelImage({url:'original',alternatives:['unused']},{fetchImage:async()=>{calls++;return original}}),original)
  assert.equal(calls,1)
  const c=new AbortController();c.abort()
  await assert.rejects(fetchModelImage({url:'original',alternatives:['unused']},{signal:c.signal,fetchImage:async()=>jpeg(3277,4096)}))
})
