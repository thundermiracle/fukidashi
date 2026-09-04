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
  order; clicking one scrolls the page to it and opens its bubble.
- **Everything you annotated** — the popup's second tab collects every page
  carrying notes under the site it belongs to. Pick a page to read its notes,
  or open it again in a tab; picking one of its notes opens the page and jumps
  straight to it.
- **Take them elsewhere** — the settings page writes every note out to one
  file: JSON to keep as a backup and read back in later, or Markdown to drop
  into a notes app — the plain kind Notion reads, or the properties, callouts
  and highlights Obsidian understands.
- **Reads translations too** — a page opened through Google Translate is still
  that page, so notes taken on either belong to the same list, and highlights
  survive the text being swapped out. The memos themselves are left in the
  language they were written in.

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
├── core/          Anchoring notes to page text, URLs, types, pure helpers
├── services/      Storage, highlight rendering, messaging
├── components/    React UI (toolbar, composer, bubble, list)
├── entrypoints/   content script, popup
├── testing/       Test helpers (fake chrome.storage, jsdom setup)
└── assets/        Assets imported from code
public/icon/       Extension icons (picked up automatically by WXT)
```

A note stores the text it was attached to together with its surrounding
context, so it can be found again after the page changes. See
`src/core/anchor/`.

## Limitations

- Text inside iframes and inside a page's own shadow DOM is not annotated.
- A note is anchored to the words it was taken on, so one written on a
  translated page comes back with that translation, not with the original.
  The popup lists it either way, but opening it from there goes to the
  original page, where there is no translated text to jump to.
- A note is lost when the page rewrites the text it was attached to; the popup
  still lists it, and the highlight returns if the text comes back.
- Notes live in `chrome.storage.local`: they stay on this device and are not
  synced between machines.
- Deleting a note is immediate — there is no undo.
- Built for Chrome; a Firefox build is produced but has not been tested there.

## License

MIT
