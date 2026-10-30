# PinWish

CS 446 final project starter using React, TypeScript, Vite, and Tailwind CSS.

## Run locally

Use Node 22.12+ (or Node 20.19+). With nvm: `nvm use`.

```sh
npm ci
npm run dev
```

`npm run check` runs lint, strict TypeScript checks, and the production build. Run it before committing. GitHub Actions runs the same checks on pushes and pull requests.

Individual commands: `npm run lint`, `npm run typecheck`, `npm run build`. After building, `npm run preview` serves `dist/` locally.

## Design implementation

The current screen is a starter page, not the full application. The copied `design/` directory includes Figma node IDs, review notes, and mobile save-state contracts. Start with `design/figma-handoff.json` and `design/mobile-save-flow.json`. Figma source: https://www.figma.com/design/cwIWojuveOSNxGeK3nlDUZ/pinWish

Tailwind uses its Vite plugin and CSS import. The runtime design tokens live in `src/styles/tokens.css`. Shared PinWish colors are mapped to utilities such as `bg-brand`, `bg-page`, and `text-ink` in `src/index.css`.

## Figma MCP in VS Code

Open this folder in VS Code. Open `.vscode/mcp.json`, click Start above the Figma server, and complete the Figma sign-in / Allow access prompt. This uses the official remote server and OAuth, so no personal API token belongs in this file. This configuration is for VS Code's MCP client; extensions with separate MCP settings may require their own configuration.

Official instructions: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/#vs-code

A personal access token is only needed for a separate REST API or third-party integration. Never place a token in React source, a `VITE_` environment variable, or a tracked JSON file. Browser-visible environment variables are public. This starter does not need any API keys.

AWS services, authentication, actual place saving, and map integration are not configured yet.

## Project layout

- `src/`: application code; `src/styles/tokens.css` is the shared token source.
- `design/`: Figma handoff and mobile interaction specifications. `design-review.json` records completed fixes and remaining decisions.
- `design/assets/map-preview.png`: illustrative map reference, not a production map or accurate geographic data.
- `.vscode/mcp.json`: shared Figma MCP connection configuration.
- `.github/workflows/ci.yml`: lint and build checks.

`node_modules/` and `dist/` are generated locally and excluded from Git. Add feature components and API modules when implementing those features; AWS infrastructure and backend code will be added when the architecture is defined.
