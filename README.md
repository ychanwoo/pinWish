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

A personal access token is only needed for a separate REST API or third-party integration. Never place a token in React source, a `VITE_` environment variable, or a tracked JSON file. Browser-visible environment variables are public. This starter does not need any API keys.

Without cloud configuration, this remains an interactive UI preview with in-memory sample data. With the cloud settings below, Cognito and DynamoDB provide authentication and persistent saved places. A live map provider is not connected. Instagram photo analysis is available only through the opt-in local API backed by AWS Bedrock described below. The map is the illustrative image from Figma; its controls only manipulate the preview. Directions opens Google Maps in a new tab using the sample address.

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

`node_modules/` and `dist/` are generated locally and excluded from Git. Add feature components and API modules when implementing those features; The experimental local backend lives in `scripts/instagram/`; production AWS infrastructure is still to be added.

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

### Try the save flow

1. Click **Save a place** (mobile) or **Add pin** (desktop).
2. Enter `https://www.instagram.com/p/example/`, `https://maps.app.goo.gl/grandcentral`, or a sample place name such as `Maru Coffee`.
3. Confirm the location and enter a note. Choose **Weekend ideas** to save a new record; **LA weekend** already contains the five sample places and shows the duplicate state.
4. Save and open the result. Desktop shows the map confirmation; mobile shows the full-screen success state.

The mock resolver recognizes only the supplied sample places. Other well-formed links/addresses show the manual-location fallback; they are not parsed or geocoded. This deliberately avoids implying that arbitrary Instagram posts already work. Closing and reopening the save dialog preserves an unsaved draft for the current page session.

Use `/?state=ready&scenario=save_error` to simulate one failed save followed by a successful retry. Use `/?state=entry&scenario=lookup_error` to simulate one failed lookup. Draft fields survive retries. `?scenario=not_found` exercises manual lookup fallback. Clipboard buttons use the browser clipboard API and display a fallback message when permission is denied.

Sidebar counts, collection selection, search results, and map pins follow the in-memory sample records. Desktop detail pins switch the dossier without closing it; the map remains an illustrative image, not geographic positioning or automatic panning. Notes can be edited or cancelled, and saved edits survive navigation within this page session. Opening hours are unverified; coordinates, dates, and imagery remain design samples. The sample map remains separate from the live place-confirmation flow below. Persistence, transit layers and account settings belong to follow-up work.

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

Tests cover desktop/mobile search, invalid input, duplicate detection, failed-save retry, draft retention, cancelled lookup, detail pin switching, note editing and cancellation, collection isolation, filter/map synchronization, image loading, and horizontal overflow across the state previews. `npm run check` remains the lint/typecheck/production-build check.

## Experimental Instagram validation (issue #3)

Real Instagram links are separated from demo place lookup. URL validation is not a claim that a post exists or is accessible. An opt-in local backend can retrieve photo carousels from public HTML and send the images to Amazon Bedrock for candidate extraction. The default AWS Bedrock Qwen3-VL model reads photo batches and preserves original-language names. Manual comparison passed 8/8 Donghae headings twice; LA remains 9/10 because of one Hangul error. Candidate names can be corrected while original OCR evidence and photo links remain available. Mixed-video posts are explicitly unsupported, and no candidate is saved to the map.

See [the feasibility report](docs/validation/instagram-feasibility.md) for real sample results, AWS usage, limitations and the two-terminal run instructions. No Meta API key is required for this experiment; it does require server-side AWS credentials with Bedrock invocation access. The import/search backend and frontend hosting are not deployed; the separate authenticated storage API is deployed as described below.

```sh
npm run test:unit
npm run test:import-ui
```

`test:import-ui` uses synthetic API fixtures and makes no AWS calls. `npm run extract:instagram -- DfFCMjzk02S` is an explicit, billable live experiment. The local API caps Instagram imports at three per process; place requests have a separate cap.

### Place display names

Extraction preserves the original `name` and `evidence`; user changes are stored separately as `correctedName`. The shared `getPlaceDisplayName` policy selects Korean names for confirmed South Korean locations (`KR`) and English names for other confirmed countries, falling back to the correction/original when the requested localized name is unavailable. The country must come from confirmed place-search results, never from the language of an Instagram post. The opt-in import review now connects to Amazon Location search and details. Explicit confirmation applies the provider name while preserving OCR evidence. Amazon Location does not support detailed South Korean places; those candidates cannot be confirmed with this provider. Korean overseas search queries are automatically converted to English through Bedrock; original OCR text is never rewritten. There are no sample-specific runtime substitutions.


## Place search and confirmation (issue #11)

The import review supports searching by name/region/country, comparing addresses, selecting a match, and explicitly confirming fresh AWS place details. Each photo heading can have multiple locations or be skipped. Confirmation retains the provider ID, coordinates, country, original Instagram URL, slide numbers, OCR evidence and user correction. Closing/reopening retains this draft; refreshing clears it. **Done reviewing does not save to the database or place pins on the map.**

```sh
# Terminal 1: AWS credentials remain server-side (normal AWS credential chain)
npm run dev:api
# Terminal 2
VITE_ENABLE_INSTAGRAM_PREVIEW=true npm run dev
```

Requires Bedrock access for new imports and Korean query conversion and `geo-places:SearchText` / `geo-places:GetPlace` for locations. The scoped policy template is [docs/aws/place-search-policy.json](docs/aws/place-search-policy.json); no IAM role or cloud deployment is created by these commands. Export server settings in your shell; the Node API does not automatically load Vite `.env` files.

**Known limits:** Automatic English conversion can be uncertain or wrong, especially when OCR misspells a name. The UI shows the search query; correct it and inspect the address when needed. English localization may fall back to the provider's default name. South Korea detailed POI/address coverage is unsupported, and country-center results are rejected. Same-name branches require explicit review. Duplicate protection uses provider IDs, so distinct IDs for the same physical venue still require review.

The local API caps Instagram imports at 3 and place API requests at 100 per process, with separate concurrency limits. Restarting resets these limits; they are not an AWS billing cap. AWS calls are billable and use Storage intended use. This loopback development API is not a public production API.

See [the implementation and live validation report](docs/validation/place-confirmation.md) for coverage, evidence and remaining work. `npm run test:unit` and `npm run test:import-ui` use synthetic provider fixtures and do not call AWS.


### Automatic English search queries

For Korean-containing name/region input, the server asks Bedrock for an English search query and region, then searches Amazon Location. English-only input bypasses the model. Explicit KR country filters remain unsupported. Uncertain/malformed output or a model outage falls back to the original input with an explanatory message; cancellation still stops the request. Successful conversions are cached by query, region and country for 15 minutes (at most 100 entries). Each uncached conversion makes one billable Bedrock request within the existing place-request quota.

Optional server setting `PINWISH_QUERY_MODEL` overrides the query model; otherwise it uses `PINWISH_BEDROCK_MODEL` or the existing Qwen3-VL default. Requires `bedrock:InvokeModel` permission on that model, in addition to the Places-only policy template. No credentials belong in browser variables. Confirmed English labels come from AWS place details, not the generated search guess; provider localization fallback remains possible.

Live original LA OCR validation: 9/10 inputs produced English queries with relevant candidates. The misread `포인트 듑` was left for review rather than silently guessed. Search results remain candidates, not automatic venue confirmations. See [live evidence](docs/validation/english-query-live.json).

## Accounts and persistent saved places (issue #13)

The configured local app now has a top-right **Sign in** button, separate Sign in/Create account views, inline red email-validation errors, verification/resend-code and password-reset flows. Creating an account opens email verification; successful verification returns to Sign in with the email retained. If an unverified user tries to sign in later, the verification screen opens again. No Google login is configured.

**Keep me signed in for 7 days** is optional. Checked sessions survive browser reopening for at most seven days; unchecked sessions use tab-session storage. Signing out clears locally visible private data. The browser renews expired access tokens through Cognito without extending the seven-day deadline.

Submitting an Instagram link while signed out opens the login modal and retains the draft. Once signed in, confirm locations and use **Save confirmed places**. Saved records survive refresh and a new sign-in. Notes, visited state and bookmarks persist; detail view includes original Instagram source links and an explicitly confirmed delete action. Retries preserve confirmed drafts, and repeated saves do not duplicate the same provider ID. The map is deliberately a labeled placeholder in cloud mode until the next map-integration task.

```sh
npm run cloud:configure  # read public identifiers from pinwish-storage-dev
npm run dev:api         # terminal 1: existing local import/place-search API
npm run dev             # terminal 2: frontend with .env.local cloud settings
```

A development stack named `pinwish-storage-dev` is deployed in us-east-1. It contains Cognito, API Gateway, Lambda and DynamoDB; the frontend and import/search API remain local. See [infrastructure and API documentation](infra/README.md) for permissions, reproducible deployment, session behavior, costs, limits and cleanup. The generated configuration `.env.local` is ignored by Git.

`npm run test:cloud-ui` uses mocked Cognito/storage responses. Existing demo/import tests explicitly disable cloud configuration so they cannot operate against your live account. Live verification results are in [storage-live.json](docs/validation/storage-live.json) and [storage-browser-live.json](docs/validation/storage-browser-live.json). Real email delivery still needs confirmation through your own signup; automated test accounts suppressed outgoing email.
