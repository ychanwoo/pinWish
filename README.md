# PinWish

CS 446 final project UI built with React, TypeScript, Vite, and Tailwind CSS.

## Run locally

Use Node 22.12+ (or Node 20.19+). With nvm: `nvm use`.

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

This is an interactive UI preview. Places, notes, collections, and bookmarks are held in memory and reset on reload. AWS services, authentication, Instagram parsing, persistent storage, and a live map provider are not connected. The map is the illustrative image from Figma; its controls only manipulate the preview. Directions opens Google Maps in a new tab using the sample address.

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

`node_modules/` and `dist/` are generated locally and excluded from Git. Add feature components and API modules when implementing those features; AWS infrastructure and backend code will be added when the architecture is defined.

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

Sidebar counts, collection selection, search results, and map pins follow the in-memory sample records. Desktop detail pins switch the dossier without closing it; the map remains an illustrative image, not geographic positioning or automatic panning. Notes can be edited or cancelled, and saved edits survive navigation within this page session. Opening hours are unverified; coordinates, dates, and imagery remain design samples. Live place metadata, transit layers, account settings, and source-link integration belong to the backend/map follow-up work.

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

Tests cover desktop/mobile search, invalid input, duplicate detection, failed-save retry, draft retention, cancelled lookup, detail pin switching, note editing and cancellation, collection isolation, filter/map synchronization, image loading, and horizontal overflow across the state previews. `npm run check` remains the lint/typecheck/production-build check.
