# PinWish

CS 446 final project UI built with React, TypeScript, Vite, and Tailwind CSS.

## Run locally

Use Node 22.14+ for the local API and tests (which use native TypeScript stripping). With nvm: `nvm use`.

```sh
npm ci
npm run dev
```

`npm run check` runs lint, strict TypeScript checks, and the production build. Run it before committing. GitHub Actions runs the same checks on pushes and pull requests.

Individual commands: `npm run lint`, `npm run typecheck`, `npm run build`. After building, `npm run preview` serves `dist/` locally.

## Design implementation

The application implements the desktop workspace, empty collection, place dossier, save dialog, saved confirmation, mobile list/map/detail, and mobile save/loading/error screens. The `design/` directory includes Figma node IDs, review notes, and mobile save-state contracts. Start with `design/figma-handoff.json` and `design/mobile-save-flow.json`. Figma source: https://www.figma.com/design/cwIWojuveOSNxGeK3nlDUZ/pinWish

Tailwind uses its Vite plugin and CSS import. The runtime design tokens live in `src/styles/tokens.css`. Shared PinWish colors are mapped to utilities such as `bg-brand`, `bg-page`, and `text-ink` in `src/index.css`.

## Figma MCP in VS Code

Open this folder in VS Code. Open `.vscode/mcp.json`, click Start above the Figma server, and complete the Figma sign-in / Allow access prompt. This uses the official remote server and OAuth, so no personal API token belongs in this file. This configuration is for VS Code's MCP client; extensions with separate MCP settings may require their own configuration.

Official instructions: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/#vs-code

A personal access token is only needed for a separate REST API or third-party integration. Never place a token in React source, a `VITE_` environment variable, or a tracked JSON file. Browser-visible environment variables are public. The Figma connection does not need a personal API key; the live application uses the public map key described below.

Without cloud configuration, the app is an in-memory UI preview. Cloud mode uses
Cognito, API Gateway/Lambda/DynamoDB and an Amazon Location map. Instagram image
analysis and place search use AWS Bedrock/Location through authenticated cloud jobs.
The frontend is deployed on Amplify; open a bounded AWS test window before use. Directions opens
Google Maps externally; in-app route calculation is not implemented.

## Project layout

- `src/components/`: shared navigation, list, map preview, place detail, and save-flow components.
- `src/data/places.ts`: sample place records and deterministic mock lookup.
- `src/styles/`: Figma tokens and responsive styles.
- `public/assets/figma/`: locally downloaded Figma images and original SVGs; `design/asset-manifest.json` maps them to their source screens.
- `tests/ui.spec.ts`: desktop/mobile browser tests.
- `design/`: Figma handoff and mobile interaction specifications. `design-review.json` records completed fixes and remaining decisions.
- `design/assets/map-preview.png`: illustrative map reference, not a production map or accurate geographic data.
- `.vscode/mcp.json`: shared Figma MCP connection configuration.
- `.github/workflows/ci.yml`: lint and build checks.

`node_modules/` and `dist/` are generated locally and excluded from Git. The experimental import backend lives in `scripts/instagram/`; deployed storage/map infrastructure is generated from `scripts/cloud/`.

## Local UI review

Start with `npm run dev` and open the URL printed by Vite (normally http://localhost:5173). Use responsive browser tools at 390 × 884 for mobile and 1280 × 1024 for desktop. The mobile list is naturally scrollable (1396px reference height). At intermediate widths, the desktop panels adapt rather than overflowing.

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

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

Tests cover desktop/mobile search, invalid input, duplicate detection, failed-save retry, draft retention, cancelled lookup, detail pin switching, note editing and cancellation, collection isolation, filter/map synchronization, image loading, and horizontal overflow across the state previews. `npm run check` remains the lint/typecheck/production-build check.

## Experimental Instagram validation (issue #3)

Real Instagram links are separated from demo lookup. The opt-in local backend
retrieves public photo carousels and sends image batches to Amazon Bedrock. It
preserves original headings and printed address hints, converts overseas searches
to English, retrieves Amazon Location matches, and automatically saves resolved
places in authenticated cloud mode. Cover/end slides are ignored. Mixed-video
posts and detailed South Korean place lookup remain unsupported.

The latest LA live check resolved and saved all 10 candidates from 12 photos,
including regional fallback for an address search that returned a building tenant.
See [current validation](docs/validation/automatic-import.md). Earlier feasibility
reports record historical extraction-only results, not current end-to-end behavior.

See [the feasibility report](docs/validation/instagram-feasibility.md) for real sample results, AWS usage, limitations and the two-terminal run instructions. No Meta API key is required for this experiment; it does require server-side AWS credentials with Bedrock invocation access. The current hosted flow uses authenticated AWS jobs; the report describes the earlier local feasibility stage. See the AWS web deployment guide below for current commands.

```sh
npm run test:unit
npm run test:import-ui
```

`test:import-ui` uses synthetic API fixtures and makes no AWS calls. `npm run extract:instagram -- DfFCMjzk02S` is an explicit, billable live experiment. The local API caps Instagram imports at three per process; place requests have a separate cap.

### Place display names

Extraction preserves original names, evidence, printed addresses and slide references.
Overseas visible labels use English. Automatic matching checks provider names and
can retry at city/state scope when exact-address results are unrelated. Uncertain
matches remain unplotted; coordinates always come from AWS place details. Original
Korean evidence remains in stored source metadata. KR labels are supported by the
display policy, but this provider's detailed KR lookup remains unsupported.


## Place search and confirmation (issue #11)

The import now searches extracted names automatically, compares provider names and retrieves fresh AWS details for a matching result, and saves located places as a batch in cloud mode. There is no per-place confirmation step. The original Instagram URL, slide numbers and OCR evidence remain in source data; overseas labels use English and Korean OCR evidence is not displayed. Closing during lookup cancels requests and retains the draft. Failed locations do not prevent the successful ones from saving. In demo mode the same lookup runs without account storage.

```sh
npm run cloud:configure
npm run cloud:test:start -- 60
npm run dev
```

Requires Bedrock access for new imports and Korean query conversion and `geo-places:SearchText` / `geo-places:GetPlace` for locations. The scoped policy template is [docs/aws/place-search-policy.json](docs/aws/place-search-policy.json); no IAM role or cloud deployment is created by these commands. Export server settings in your shell; the Node API does not automatically load Vite `.env` files.

**Known limits:** Automatic ranking can choose an unintended same-name branch, and OCR/translation can be wrong. Matches are automatic, not human-verified. Unresolved locations remain out of the map and can be retried. South Korea detailed POI/address coverage remains unsupported; country-center results are rejected. Duplicate protection uses provider IDs, so distinct IDs for one physical venue may still yield separate pins.

The local API caps Instagram imports at 3 and place API requests at 100 per process, with separate concurrency limits. Restarting resets these limits; they are not an AWS billing cap. AWS calls are billable and use Storage intended use. This loopback development API is not a public production API.

See [the implementation and live validation report](docs/validation/place-confirmation.md) for coverage, evidence and remaining work. `npm run test:unit` and `npm run test:import-ui` use synthetic provider fixtures and do not call AWS.


### Automatic English search queries

For Korean-containing name/region input, the server asks Bedrock for an English search query and region, then searches Amazon Location. English-only input bypasses the model. Explicit KR country filters remain unsupported. Uncertain/malformed output or a model outage falls back to the original input with an explanatory message; cancellation still stops the request. The legacy local API caches successful conversions by query, region and country for 15 minutes (at most 100 entries). Cloud workers isolate each job; a new search can make a new conversion call, while retries of the same job ID reuse its result. Each uncached conversion makes one billable Bedrock request within the existing place-request quota.

Optional server setting `PINWISH_QUERY_MODEL` overrides the query model; otherwise it uses `PINWISH_BEDROCK_MODEL` or the existing Qwen3-VL default. Requires `bedrock:InvokeModel` permission on that model, in addition to the Places-only policy template. No credentials belong in browser variables. English labels prefer AWS place details; an English query can serve as the display fallback when the provider lacks an English title. Original source text remains untouched.

Historical original LA OCR validation: 9/10 inputs produced English queries with relevant candidates. That earlier run left the misread photo-4 heading unresolved. The current flow uses its printed address as context and resolved it in the latest live validation. That earlier report measured search candidates, not the accuracy of the new automatic matching flow. See [live evidence](docs/validation/english-query-live.json).

## Accounts and persistent saved places (issue #13)

The configured local app now has a top-right **Sign in** button, separate Sign in/Create account views, inline red email-validation errors, verification/resend-code and password-reset flows. Creating an account opens email verification; successful verification returns to Sign in with the email retained. If an unverified user tries to sign in later, the verification screen opens again. No Google login is configured.

**Keep me signed in for 7 days** is optional. Checked sessions survive browser reopening for at most seven days; unchecked sessions use tab-session storage. Signing out clears locally visible private data. The browser renews expired access tokens through Cognito without extending the seven-day deadline.

Submitting an Instagram link while signed out opens the login modal and retains the draft. Once signed in, submit the post link. Located places are automatically saved and shown on the map; no per-place confirmation is required. Saved records survive refresh and a new sign-in. Notes, visited state and bookmarks persist; detail view includes original Instagram source links and an explicitly confirmed delete action. Retries preserve confirmed drafts, and repeated saves do not duplicate the same provider ID. Cloud mode displays the actual Amazon Location map.

```sh
npm run cloud:configure  # read public identifiers from pinwish-storage-dev
npm run cloud:test:start -- 60
npm run dev             # frontend uses the deployed backend
```

A development stack named `pinwish-storage-dev` is deployed in us-east-1. It contains Cognito, API Gateway, Lambda, DynamoDB and S3; Amplify hosts the frontend and a separate async worker runs imports and searches. See [infrastructure and API documentation](infra/README.md) for permissions, reproducible deployment, session behavior, costs, limits and cleanup. The generated configuration `.env.local` is ignored by Git.

`npm run test:cloud-ui` uses mocked Cognito/storage responses. Existing demo/import tests explicitly disable cloud configuration so they cannot operate against your live account. Live verification results are in [storage-live.json](docs/validation/storage-live.json) and [storage-browser-live.json](docs/validation/storage-browser-live.json). Real email delivery still needs confirmation through your own signup; automated test accounts suppressed outgoing email.

## Live saved-place map

Cloud mode now uses Amazon Location Maps V2 with MapLibre. After provisioning the
stack, run `npm run cloud:configure`, restart `npm run dev`, and use port 5173.
Open a test window with `npm run cloud:test:start`; a separate local API is not needed.
No Google Maps key is needed. Directions still opens the external Google Maps
website; in-app route calculation is not part of this change.

All saved-record pages load before publishing the map/list snapshot. Search,
collection and unvisited filters determine the pins. Click a pin or use the
accessible **Places on map** selector to open its dossier and center the map.
**Show all** fits the current filtered pins. Nearby pins cluster; click a cluster
to zoom in. The selector also reaches places at identical coordinates. On mobile,
use **Map** to open the map and the detail Back button to return.

Missing configuration, WebGL failure, map request failures and storage failures
show separate recovery guidance. Invalid coordinates stay in the list and are
not plotted. Demo mode still uses the Figma illustration.

Run `npm run test:map-ui` for isolated map integration checks (local style fixture,
mock accounts/storage). See `docs/validation/interactive-map.md` for live results.

## Automatic representative place photos

The active collection prefetches up to 12 photos in the background, with paced
requests. Reopening a place reuses its in-memory photo for up to ten minutes;
concurrent requests for the same photo are combined. Cache storage is bounded
to 40 entries / 24 MiB and cleared on logout/account changes. Deleting a place
also invalidates its photo cache. Newly discovered photos still need time on
the first lookup; cached display does not mean all first-time photos are instant.

Saving a confirmed place automatically starts an AWS Lambda photo lookup. No file
picker, upload, replacement or manual photo-entry workflow is required. The worker
matches the place name and coordinates against Wikipedia/Wikidata, selects an
eligible Wikimedia Commons JPEG, and stores a sanitized copy in private S3 with
its author, license and source. The detail view loads it automatically and allows
enlargement. Existing saved places start the same lookup when their details open.

Discovery is best effort: Wikimedia does not cover every restaurant or business.
A missing or unavailable photo never prevents a place from being saved. No random
stock photo is substituted. Negative results are cached for one day; transient
failures for five minutes. Pending jobs have a two-minute lease. Source and license
links remain visible beside the image; resized copies retain the source license.

Run `npm run dev` and sign in after deploying the updated AWS stack. Instagram
import uses the deployed processing API after `npm run cloud:configure`. Photo discovery runs in AWS and
needs no extra user API key.

```sh
npm run test:unit
npm run test:cloud-ui
PINWISH_RUN_LIVE_PHOTO_TESTS=1 node scripts/cloud/validate-photos-live.mjs
```

The live check creates temporary AWS users and saves a real place to exercise
background discovery, authenticated retrieval and cleanup. Set
`PINWISH_PHOTO_BROWSER_URL=http://127.0.0.1:5173` to also exercise the actual local
browser UI. It deletes its test records, objects and accounts afterward. See
[photo validation](docs/validation/place-photos.md).

## Hosted web and bounded AWS tests

See [AWS deployment and test sessions](docs/aws-web-deployment.md). The hosted web
uses authenticated asynchronous AWS processing; it does not depend on a local
Instagram API. Open a 60-minute test window with `npm run cloud:test:start`, and
stop early with `npm run cloud:test:stop`. Paused storage may still incur charges.
The top-left menu toggles the desktop collection sidebar; search reopens it.

## Persistent collections

Signed-in users can create empty collections, rename them, move saved places and
delete collections without deleting their places. Collections survive refresh and
sign-in. Existing collection names are migrated automatically; **Saved places** is
the initial default and can also be renamed or deleted. See [collection behavior, API and validation](docs/persistent-collections.md).

## Live-data interface

Cloud mode sorts Recently added by actual creation time, supports address search
and unvisited filtering, and restores owned places from private links after login.
Category tabs are hidden until reliable venue categories are stored; names are not
used to guess Coffee/Food/Culture classifications. The save dialog currently
offers Instagram post links and direct place search as separate entry points.
Public sharing remains a follow-up feature. See [UI behavior and validation](docs/validation/live-data-polish.md).

## Direct place search

Choose **Place search** in the save dialog to search a name or address with an
optional city/region. Select the correct result, choose a collection and add it
to your map. Original queries are preserved; overseas results use English names.
The backend verifies the owned details job before saving, and duplicate places
keep existing notes and collections. No Instagram link is required.

See [behavior, API and validation](docs/direct-place-search.md). Run
`npm run test:direct-ui` for the dedicated browser checks.

## Read-only collection sharing

Use **Share collection** in a collection's menu (or Manage collection on mobile)
to create a link friends can open without an account. Public views include the
collection name, places, map and available photos. Personal notes, visited state,
account details and original source data remain private. Owners can stop sharing;
links also expire after 30 days or when the original collection is deleted.

See [sharing behavior, privacy and testing](docs/collection-sharing.md).
[Itinerary planning and sharing](docs/next-collection-itinerary.md) are recorded
as the next feature and are not implemented in this branch.

## Collection itineraries

Collection `⋮` → **Plan a trip** (mobile: **Manage collection**). Select 3–20 places,
review opening hours and visit lengths, then generate, adjust, save and share an
itinerary. Missing hours are included with an explicit unverified-hours notice; visits are never silently
scheduled outside known hours. See [itinerary behavior, API and limits](docs/collection-itinerary.md).

## Map colors and opening hours

Visited map pins show a check, while collection colors can be changed or reset using **Map colors**. Preferences persist per account. Place details include cached provider weekly hours and a venue-local status qualified as based on listed hours. Missing and stale schedules remain explicit. See [map appearance implementation and validation](docs/map-appearance.md) for collection grouping, cache lifetime, limits and local test steps.
