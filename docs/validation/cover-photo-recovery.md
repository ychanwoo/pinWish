# Cover photo recovery

The [release trace](post-refactor-release.json) records a GET to
`/places/:id/photo` ending in `net::ERR_FAILED` with no HTTP status. The
[New York import run](instagram-import-performance.md) observed temporary 429s
on photo and other storage reads. Neither trace identifies the cause of the
individual failed GET. The private photo endpoint returns JPEG bytes from S3;
the browser displays a local blob URL, not a time-limited provider URL.

Two failures reproduced on the previous frontend at both 1280px and 390px:

- An HTTP 200 with discovery status `unavailable` ended automatic loading.
  Discovery stores a retry deadline, but the detail view only polled `pending`.
- A ready response containing undecodable JPEG bytes was cached before the
  browser tried to display it. Reopening the dossier could reuse the bad image.

The client now respects the discovery deadline and coalesces background and
detail reads by place within the signed-in session. An unavailable result
gets one scheduled recovery attempt per active view or prefetch pass. A
genuine no-match stays cached through its retry window. JPEG decoding happens
before caching; one bad payload gets one replacement read. Existing storage
transport retries handle network errors and throttling. No database migration
or change to the discovery worker is required.

## Reproduce locally

Run the browser suites sequentially because they use the same local server port.

```sh
npm run test:cloud-ui -- tests/place-photos.spec.ts
npm run test:webkit-ui -- tests/place-photos.spec.ts
npm run test:map-ui
npm run test:unit
npm run check
```

The photo suites use intercepted endpoints, generated JPEG bytes and synthetic
places. They exercise dropped responses, HTTP 429, worker cooldown, corrupt
bytes, no match and an exhausted transport retry with manual recovery. The
four one-failure cases assert two photo GETs total, including the initial
request. No-match checks reopen the detail after advancing the clock and
verify the saved note, collection and mapped place. A separate clock test
covers the full five-minute cooldown without repeated GETs. A worker unit
test sends four concurrent reads after expiry and verifies only one new
discovery job is enqueued. Mobile coverage uses a 390px browser viewport.
