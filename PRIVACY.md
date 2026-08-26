# Privacy Policy for Fukidashi

**Last updated: August 26, 2026**

Fukidashi does not transmit, sell, or share any user data. Everything
the extension stores stays on your device.

## What Fukidashi stores, and where

When you highlight text or write a note, Fukidashi saves:

- the note text you write,
- the highlighted text, together with a small amount of surrounding page text
  used to find the highlight again on your next visit,
- the URL and title of the page the note belongs to,
- one on/off setting for the extension.

All of this is stored locally in your browser through `chrome.storage.local`.
It is never sent anywhere: there is no server, no account, no analytics, no
tracking, and no third-party service involved.

## Permissions

- **storage** — saves your notes and the on/off setting on your device.
- **activeTab** — lets the popup read the current tab's address and talk to
  that tab, so it can list and scroll to the notes on the page you are viewing.
- **Access to web pages (content script)** — Fukidashi runs on the pages you
  visit so it can restore your saved highlights when a page loads and show the
  annotation toolbar when you select text. Page content is processed only on
  your device and only for this purpose.

## Data removal

Delete individual notes from the page or from the popup at any time. Removing
the extension (`chrome://extensions`) deletes all stored data.

## Changes

If this policy ever changes, the new version will be published at this address
and the change will be visible in the repository history.

## Contact

Questions or concerns: open an issue at
https://github.com/thundermiracle/fukidashi/issues
