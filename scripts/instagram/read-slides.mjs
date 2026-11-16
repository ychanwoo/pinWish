// Bounded parallel OCR; preserve source order even when requests finish out of order.
export async function readSlides(images, read, signal, onProgress = async () => {}) {
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  const results = new Array(images.length)
  let next = 0, completed = 0, failure
  let notifications = Promise.resolve()
  async function worker() {
    while (!combined.aborted && next < images.length) {
      const index = next++
      try {
        results[index] = await read(images[index], combined)
        combined.throwIfAborted()
        const done = ++completed
        notifications = notifications.then(() => onProgress(done, images.length))
        await notifications
      } catch (error) {
        failure ??= error
        controller.abort(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, images.length) }, worker))
  if (failure) throw failure
  combined.throwIfAborted()
  return results
}
