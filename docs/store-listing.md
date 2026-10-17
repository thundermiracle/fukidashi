# Store listing

What the Chrome Web Store and Firefox Add-ons pages say about the extension,
so a release that changes what it does changes this file in the same pull
request. When 0.4.0 went to review, the listing written for 0.3.0 still
promised that nothing leaves the device and that notes are not synced, next
to a privacy form declaring the sync; a reviewer can read that as a
contradiction. Keep this in step with `README.md`,
`PRIVACY.md` and `docs/store-disclosures.md`.

## Summary

`Add comments and notes to any web page`

The Chrome Web Store takes the summary from the manifest's `description`
(`wxt.config.ts`), so changing it there needs a release; the dashboard does
not edit it. Firefox Add-ons edits it on the listing page.

## Description

The same plain text for both stores; neither renders Markdown. Firefox Add-ons
holds it under the `ja` locale, the listing's default, although it is English.

```text
Fukidashi turns any web page into something you can write on. Select text, highlight it in one of five colors, and attach a note — the next time you open the page, your highlights and notes are right where you left them. Connect Google Drive, and they follow you to every browser you connect.

"Fukidashi" is Japanese for speech bubble: hover over a highlight and your note pops up in one.

HOW IT WORKS
1. Select text on any page — a small toolbar appears.
2. Pick a color to highlight the selection, or choose "Add note" to write a memo.
3. Hover a highlight to read its note; click to pin the bubble open, edit, or delete.

FEATURES
• Five highlight colors — yellow, green, blue, pink and purple
• Notes come back — every annotation is stored per page and redrawn on your next visit, including single-page apps that change the URL without reloading
• Page overview — the popup lists the current page's notes in reading order; click one to scroll straight to it and open its bubble
• Your whole library — the popup's second tab collects every annotated page, grouped by site; jump back to any page, or straight to a single note
• Sync across browsers — connect Google Drive on the settings page and your notes turn up in every browser you connect, edits and deletions included
• Optional encryption — set a passphrase and your notes are encrypted on your device (AES-256-GCM) before they are sent to Drive
• Back up and export — save every note to one JSON file and read it back in later, or export Markdown for Notion or Obsidian
• Works with Google Translate — a page opened through Google Translate counts as the same page, so notes taken on either version share one list and highlights survive the translated text
• One switch to pause — turn highlights and bubbles off everywhere without touching your stored notes

PRIVATE BY DESIGN
• No account needed — until you connect Google Drive, your notes stay in your browser's local storage and never leave your device
• Sync is opt-in and goes to you — notes are kept in a hidden app folder in your own Google Drive that only Fukidashi can open; there is no server of ours in between, and the developer never sees them
• Encrypt them if you like — with a passphrase, your notes leave the device already encrypted
• No tracking, no analytics, no ads
• Permissions: "storage" to save your notes, "activeTab" so the popup can talk to the page you are on, "identity" to sign in to Google — only when you connect Drive — and "alarms" to pick up notes from your other browsers while sync is on

GOOD TO KNOW
• Sync needs a Google account, and each browser is connected on its own
• A forgotten passphrase cannot be recovered — keep it somewhere safe
• A browser that has not synced for more than 30 days can bring back notes deleted in the meantime
• Text inside iframes and inside a page's own shadow DOM cannot be annotated
• If a page rewrites the text a note was attached to, the highlight disappears until that text comes back; the note itself stays listed in the popup
• Deleting a note is immediate — there is no undo
```

## Screenshots

All 1280×800. The Chrome Web Store takes at most five, so it gets the first
five; Firefox Add-ons gets all six.

1. **Toolbar**: a sentence selected on an article, with the color swatches and
   "Add note" above it.
2. **Composer**: the same selection being written up — green picked, "Yes
   indeed!" typed.
3. **Bubble**: the saved highlight hovered, its note open in a bubble.
4. **Popup**: "This page" and "All pages" side by side on a plain
   background, both showing the sync line in the footer.
5. **Settings, Sync**: connected to Google Drive, encrypted with a passphrase.
6. **Settings, Backup and Markdown** (Firefox only): the JSON export and the
   Notion / Obsidian Markdown export.

1–3 were taken in a headless browser with the built extension loaded, by
driving the selection, the composer and the hover over the DevTools protocol;
4–6 by serving the built popup and settings pages with a stand-in for the
`chrome.*` APIs seeded with demo notes and a connected, encrypted sync. Both
render at a device scale of 1.6 in an 800×500 window, so the text matches
across the set. A screenshot resized to fit, rather than captured at that
size, comes out stretched.

## Updating the listing

- The Chrome Web Store dashboard may refuse listing edits while a version is
  in review. Cancelling the review, editing, and submitting again gets the
  new text and screenshots reviewed together with the version.
- Firefox Add-ons edits the listing at any time, independent of version
  review.
