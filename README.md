# PinWish

PinWish turns social-media recommendations into saved places, personal maps and shareable journeys. Save places from public Instagram photo posts or search for a destination directly, organize them into collections, and plan visits around travel times and available opening hours.

Built with React, TypeScript, Vite and Tailwind CSS, with an AWS serverless backend.

## What works

- **Accounts:** email/password registration, email verification, sign-in, password reset and optional seven-day remembered sessions. Saving requires sign-in; users' private records are isolated.
- **Instagram imports:** analyze public photo carousels, extract place candidates and automatically search/save resolved locations. Original links, slide references and source text are preserved. Unresolved places remain retryable rather than receiving invented coordinates.
- **Direct search:** find a place or address, select a provider result, choose or create a collection, and add it to the map.
- **Saved places and collections:** persistent empty collections, rename/delete, move places, edit notes, bookmark and mark visits. Deleting a collection keeps its places in the current fallback collection. Every collection, including Saved places, can be renamed or deleted.
- **Maps:** Amazon Location with MapLibre, clustering, hover labels, selected-place centering, visited checks and account-persisted collection colors reflected in the sidebar. Directions open Google Maps externally; no Google Maps API key is required.
- **Photos and hours:** automatic representative-photo discovery with private S3 caching and attribution; provider hours with time-zone, freshness and uncertainty indicators. Missing photos/hours do not block ordinary place storage.
- **Sharing:** revocable read-only collection and journey links, expiring after 30 days. A place's **Copy Link** is private and requires its owner's account; it is different from public sharing.
- **Journeys:** choose 3–20 places in one known time zone, review editable visit-duration estimates, dates and driving/walking preferences, generate, save and reopen a plan. All selected stops are included by extending dates or assigning clearly labeled suggested times when necessary. Complete does not mean every opening window or route is verified.

## Run locally

Use Node.js 22.14+ (`nvm use` if installed):

```sh
npm ci
npm run dev
```

A fresh checkout without cloud configuration shows an in-memory UI preview. For real accounts, maps and saved data, the existing AWS development stack and credentials are required:

```sh
npm run cloud:configure
npm run cloud:test:start -- 15
npm run dev
```

Use localhost port 5173 and stop the test window afterward from a second terminal:

```sh
npm run cloud:test:stop
npm run cloud:status
```

Configuration is written to ignored `.env.local`. Never put AWS secret credentials, account tokens or provider secrets in `VITE_*` variables: they are visible to the browser. The restricted map key is intentionally public.

See [local development](docs/local-development.md) for preview-only overrides, mock screen URLs, all test suites and command prerequisites.

## Verify changes

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

These checks use local fixtures. CI runs unit tests, lint, TypeScript checking and a production build; the browser suites must be run separately. Opt-in live validation scripts call real AWS services and may incur charges. Historical reports describe their recorded version and date, not a new test of every later release.

## AWS architecture and operation

| Service | Role |
| --- | --- |
| Amplify Hosting | HTTPS static frontend and paused-session page |
| Amazon Cognito | Email/password accounts and access tokens |
| API Gateway + Lambda | Authorized storage, asynchronous import/search jobs, planning and public read-only shares |
| DynamoDB | User records, collection catalogs, jobs, journeys, caches and quotas |
| Amazon S3 | Private representative photos and deployment artifacts |
| Amazon Bedrock | Photo/text place extraction and search-query conversion |
| Amazon Location Service | Place search/details, maps and journey route matrices |
| EventBridge Scheduler / rules + CloudWatch | Automatic pause, photo cleanup and operational logs |

The [hosted demo](https://demo.d297h6ubgr1uhw.amplifyapp.com) is normally paused between bounded tests. Starting a session enables the deployed version; it does not deploy local changes. Pausing preserves stored data and reduces usage, but does not guarantee a zero bill. Budget alerts and request quotas are not spending caps.

Read [deployment, pause/resume and rollback](docs/aws-web-deployment.md) before using deployment commands. The scripts update an existing development stack; they are not a fresh-account bootstrap. See [documentation and release status](docs/README.md) for the current verification boundary.

## Limits to understand

- Public Instagram retrieval is experimental. Private posts, videos/Reels and native mobile share-sheet intake are outside the current scope; web URL entry is supported. Successful sample posts do not guarantee every future post is retrievable.
- OCR, translation and automatic place matching can be wrong or choose a different same-name branch. Overseas labels use English while original source text is retained. Detailed South Korean lookup is unsupported by the current integration.
- Photo coverage is best-effort Wikimedia discovery, not Google Places Photos. Cold discovery can take time; there is no manual upload workflow.
- Journey duration defaults are category estimates, not venue-specific guarantees. Planning uses deterministic scheduling and AWS route data, not AI-generated opening hours. Suggested times require confirmation; holidays, tickets, last admission, hotel/airport transfers and future traffic are not guaranteed.
- Public shares are readable by anyone holding the link, while enabled and within an active test session. Revocation blocks future requests, not copies already downloaded. Shared collections are not collaboratively editable.

## Project layout and design

- `src/`: application screens, feature-organized components, client services and shared styles. See [code architecture](docs/code-architecture.md) for module and loading boundaries.
- `backend/`: storage, sharing, journey scheduling and supporting server modules.
- `scripts/cloud/`: deployment, runtime controls and optional live checks.
- `scripts/instagram/`: extraction/search modules and experimental local tooling.
- `tests/`: unit and browser suites; `playwright*.config.ts` selects each suite.
- `design/`: Figma handoff, design references and asset manifest; `public/assets/figma/` contains runtime assets.
- `docs/`: current guides and dated validation evidence; `infra/README.md` describes infrastructure/contracts.

[Original Figma design](https://www.figma.com/design/cwIWojuveOSNxGeK3nlDUZ/pinWish) requires appropriate file access. Runtime tokens are in `src/styles/tokens.css`; later implemented features extend the original handoff. The original design is not a complete specification of today's application.

VS Code's `.vscode/mcp.json` uses the official Figma remote MCP server with OAuth. Start/authenticate the server in VS Code; do not put a personal token into this file. See [Figma's remote server instructions](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/). Other clients may require separate MCP configuration.

## Course context

Developed as a **CS 446 Cloud Computing final project**. The project demonstrates a working AWS application with bounded test sessions and a resource-cleanup plan. The supplied assignment announcement does not require this exact phrase in the README; it is retained here as project attribution.

See the [documentation index](docs/README.md) for feature guides, operational limits and historical evidence.
