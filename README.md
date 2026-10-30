# PinWish

CS 446 final project starter using React, TypeScript, Vite, and Tailwind CSS.

## Run locally

Use Node 22.12+ (or Node 20.19+). With nvm: `nvm use`.

```sh
npm install
npm run dev
```

`npm run build` type-checks and builds into `dist/`. `npm run lint` runs Oxlint. `npm run preview` serves the production build locally.

## Design implementation

The current screen is a starter page, not the full application. The copied `design/` directory includes Figma node IDs, tokens, and mobile save-state contracts. Start with `design/figma-handoff.json` and `design/mobile-save-flow.json`. Figma source: https://www.figma.com/design/cwIWojuveOSNxGeK3nlDUZ/pinWish

Tailwind uses its Vite plugin and CSS import. Shared PinWish colors are mapped to utilities such as `bg-brand`, `bg-page`, and `text-ink` in `src/index.css`.

## Figma MCP in VS Code

Open this folder in VS Code. Open `.vscode/mcp.json`, click Start above the Figma server, and complete the Figma sign-in / Allow access prompt. This uses the official remote server and OAuth, so no personal API token belongs in this file. This configuration is for VS Code's MCP client; extensions with separate MCP settings may require their own configuration.

Official instructions: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/#vs-code

A personal access token is only needed for a separate REST API or third-party integration. Never place a token in React source, a `VITE_` environment variable, or a tracked JSON file. Browser-visible environment variables are public. This starter does not need any API keys.

AWS services, authentication, actual place saving, and map integration are not configured yet.
