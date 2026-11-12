# Local development and verification

Run all commands from the repository root. Use Node.js 22.14+ (`nvm use` with nvm) and install locked dependencies with `npm ci`.

## Choose the runtime

### UI preview without AWS

A fresh checkout without cloud configuration runs sample data in memory. If `.env.local` already contains cloud settings, override them for this process without deleting the file:

```sh
VITE_COGNITO_CLIENT_ID= VITE_STORAGE_API_URL= VITE_PROCESSING_API_URL= VITE_MAP_API_KEY= VITE_ENABLE_INSTAGRAM_PREVIEW=false npm run dev
```

The illustrated map and mock saves do not exercise AWS, real Instagram extraction, authentication or persistence. Reloading resets sample changes. Do not use these results as proof of live functionality.

### Local frontend with the existing AWS backend

Requires the existing development stack, AWS CLI credentials and provider access. No separate local API server is needed.

```sh
npm run cloud:configure
npm run cloud:test:start -- 15
npm run dev
```

Use port 5173, which is allowed by the map referrer policy. If Vite offers a different port, free 5173 before testing live maps. Restart Vite after configuration changes. In a second terminal, finish with:

```sh
npm run cloud:test:stop
npm run cloud:status
```

`cloud:configure` reads stack outputs and the browser map key into ignored `.env.local`; it does not deploy resources. For a different stack, use `AWS_REGION=<region> npm run cloud:configure -- <stack-name>`. Unlike the deployment/runtime scripts, this script takes the stack name as a positional argument, not `PINWISH_STACK`.

Cloud requests may incur charges. Pausing retains accounts, places, collections, journeys and photos. See [deployment and cost controls](aws-web-deployment.md).

## Checks without paid provider calls

```sh
npm run check
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run test:import-ui
npm run test:cloud-ui
npm run test:map-ui
npm run test:direct-ui
npm run test:processing-ui
```

`check` runs lint and the production build, including TypeScript checking. The browser suites use fixtures and local handlers, not real AWS accounts. Let their Playwright configurations start their own servers; stop manually running Vite/API servers on the configured ports first. GitHub Actions runs `npm ci`, `test:unit` and `check`; browser suites are not currently part of CI.

`npm run build` writes ignored `dist/`; `npm run preview` serves that build, not current unbuilt source. Neither command deploys. Previewing a cloud-configured build can still make live requests and requires an allowed origin.

Optional `probe:instagram`, `extract:instagram`, `dev:api` and `scripts/cloud/validate-*-live.mjs` are real-provider tooling, not part of offline verification. Read each script's opt-in requirements before running. Historical local feasibility instructions are archived in [validation](README.md#historical-evidence); prefer the authenticated deployed jobs for current application testing.

## Preview screens

In UI preview mode, start Vite as above and open the URL printed by Vite (normally http://localhost:5173). Use responsive browser tools at 390 × 884 for mobile and 1280 × 1024 for desktop. The mobile list is naturally scrollable (1396px reference height). At intermediate widths, the desktop panels adapt rather than overflowing.

| URL suffix | Screen |
| --- | --- |
| `/` | Desktop workspace / mobile place list |
| `/?view=map` | Map preview and selected place |
| `/?view=detail` | Place dossier / mobile detail sheet |
| `/?view=empty` | Empty collection |
| `/?view=saved` | Desktop saved confirmation |
| `/?view=list_loading` | List loading skeletons |
| `/?view=list_error` | List load error with retry |
| `/?state=entry` | Save-place entry |
| `/?state=ready` | Resolved location and editable note/collection |

All save states are available through `?state=`: `entry`, `resolving`, `ready`, `invalid`, `not_found`, `lookup_error`, `saving`, `save_error`, `duplicate`, `success`. Direct links to pending states are intentionally held for visual inspection. Pending states reached through interaction complete after a short mock delay. State URLs are review entry points; interaction does not rewrite the URL.

### Try the demo save flow (cloud configuration disabled)

1. Click **Save a place** near the top of the place list.
2. Enter `https://www.instagram.com/p/example/`, `https://maps.app.goo.gl/grandcentral`, or a sample place name such as `Maru Coffee`.
3. Confirm the location and enter a note. Choose **Weekend ideas** to save a new record; **LA weekend** already contains the five sample places and shows the duplicate state.
4. Save and open the result. Desktop shows the map confirmation; mobile shows the full-screen success state.

The mock resolver recognizes only the supplied sample places. Other well-formed links/addresses show the manual-location fallback; they are not parsed or geocoded. This deliberately avoids implying that arbitrary Instagram posts already work. Closing and reopening the save dialog preserves an unsaved draft for the current page session.

Use `/?state=ready&scenario=save_error` to simulate one failed save followed by a successful retry. Use `/?state=entry&scenario=lookup_error` to simulate one failed lookup. Draft fields survive retries. `?scenario=not_found` exercises manual lookup fallback. Clipboard buttons use the browser clipboard API and display a fallback message when permission is denied.

Demo records and edits reset on reload and its map is an illustrative image.
Cloud mode instead loads persisted records, synchronizes filters with real map
pins, and persists note/bookmark/visited edits. User-owned collections, including
empty collections, persist in AWS. Copied private place URLs are not public sharing links.

