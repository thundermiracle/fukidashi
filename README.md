<div style="text-align: center; margin-bottom: 20px">
  <img style="max-width: 200px" src="./src/assets/fukidashi.png" alt="Fukidashi" />
</div>

# Fukidashi

Add comments and notes to any web page. Select text, give it a color, write a
memo — and find it again the next time you open the page.

## Features

- **Annotate a selection** — select text and a toolbar appears: pick a color to
  highlight it, or "Add note" to write a memo. The selected text keeps a
  colored background.
- **Read on hover** — hovering a highlight opens a speech bubble with the memo;
  clicking pins it open so it can be edited or deleted.
- **Notes come back** — every note is stored per page and redrawn when the page
  is opened again, including single-page apps that change the URL in place.
- **Page overview** — the popup lists the notes of the current page in reading
  order; clicking one scrolls the page to it.

## Development

- Written in TypeScript and React
- Built with the [WXT](https://wxt.dev) framework
- Formatted and linted with [Biome](https://biomejs.dev)

```shell
pnpm install
pnpm run dev
```

`pnpm run dev` opens a browser with the extension loaded (Brave, configured in
`wxt.config.ts`). To load a build by hand instead, run `pnpm run build` and add
`dist/chrome-mv3` as an unpacked extension on `chrome://extensions`.

## Commands

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `pnpm run dev`     | Start the dev server for Chrome                    |
| `pnpm run build`   | Produce a production build in `dist/`              |
| `pnpm run zip`     | Create a store-ready archive                       |
| `pnpm run compile` | Type check with TypeScript                         |
| `pnpm run test`    | Run Vitest once with coverage                      |
| `pnpm run check`   | Apply Biome's fixes (format, lint, import sorting) |
| `pnpm run ci`      | Run Biome in check-only mode (for CI)              |

## Structure

```
src/
├── core/          Anchoring notes to page text, types, pure helpers
├── services/      Storage, highlight rendering, messaging
├── components/    React UI (toolbar, composer, bubble, list)
├── entrypoints/   content script, popup, background
├── testing/       Test helpers (fake chrome.storage, jsdom setup)
└── assets/        Assets imported from code
public/icon/       Extension icons (picked up automatically by WXT)
```

A note stores the text it was attached to together with its surrounding
context, so it can be found again after the page changes. See
`src/core/anchor/`.

## Limitations

- Text inside iframes and inside a page's own shadow DOM is not annotated.
- A note is lost when the page rewrites the text it was attached to; the popup
  still lists it, and the highlight returns if the text comes back.
- Notes live in `chrome.storage.local`: they stay on this device and are not
  synced between machines.
- Deleting a note is immediate — there is no undo.
- Built for Chrome; a Firefox build is produced but has not been tested there.

## License

MIT
