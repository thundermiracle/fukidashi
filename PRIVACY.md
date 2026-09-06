# Privacy Policy for Fukidashi

**Last updated: September 5, 2026**

Fukidashi keeps your notes on your device. If you choose to connect Google
Drive, it also keeps a copy of them in your own Google Drive account, so that
your other browsers can read it. Nothing is ever sent to us: there is no
server of ours, no account with us, no analytics, and no tracking.

## What Fukidashi stores, and where

When you highlight text or write a note, Fukidashi saves:

- the note text you write,
- the highlighted text, together with a small amount of surrounding page text
  used to find the highlight again on your next visit,
- the URL and title of the page the note belongs to,
- when the note was written, edited or deleted,
- one on/off setting for the extension.

All of this is stored locally in your browser through `chrome.storage.local`.
Unless you connect Google Drive, it never leaves your device.

## Syncing with Google Drive (optional)

Sync is off until you connect Google Drive on the settings page. Once you do:

- Fukidashi writes your notes — everything listed above except the on/off
  setting, plus a marker for each deleted note so that a deletion carries
  across — to a hidden application folder in your own Google Drive
  (`appDataFolder`). Only Fukidashi can read that folder; it does not appear
  among your Drive files. It counts towards your Drive storage, as do the
  recent versions of it that Drive keeps for a while after each update.
- The copy is updated a few seconds after you edit a note, and checked every
  15 minutes for what your other browsers wrote.
- The data travels directly between your browser and Google. Google's own
  privacy policy applies to what it stores: https://policies.google.com/privacy
- To sign you in, Fukidashi asks Google for permission to use that folder
  (`drive.appdata`) and to read the email address of the account, which it
  shows on the settings page so you can tell which account is connected. The
  email address and the sign-in token are stored locally and are not sent
  anywhere else.
- Optionally, set a passphrase on the settings page. The notes are then
  encrypted on your device before they are written to Drive (AES-256-GCM,
  the key derived from the passphrase with PBKDF2-SHA256), and Google holds
  only the encrypted form. The key stays on the device; the passphrase itself
  is not stored anywhere. Every browser you connect has to be given the
  passphrase, and nobody — not Google, not the developer — can recover a
  forgotten one: without it the copy cannot be read, and syncing can only
  start over from a browser that still holds the notes.

To stop syncing, open the settings page and choose Disconnect. Tick "Also
delete the copy in Google Drive" to remove the copy at the same time. The
copy can also be removed from Google Drive itself: Settings → Manage apps →
Fukidashi → Delete hidden app data. Removing the extension does not remove
the copy. Disconnecting forgets the passphrase on that browser, if one was
set.

## Permissions

- **storage** — saves your notes and the on/off setting on your device.
- **activeTab** — lets the popup read the current tab's address and talk to
  that tab, so it can list and scroll to the notes on the page you are viewing.
- **identity** — signs you in to Google when you connect Google Drive. It is
  not used until you do.
- **alarms** — wakes the extension every 15 minutes to pick up what your
  other browsers synced. Nothing happens on the alarm while sync is off.
- **Access to web pages (content script)** — Fukidashi runs on the pages you
  visit so it can restore your saved highlights when a page loads and show the
  annotation toolbar when you select text. Page content is processed only on
  your device and only for this purpose.

On Firefox, connecting Google Drive also asks for permission to send the
addresses of annotated pages and the text quoted from them, which is what the
notes contain.

## Data removal

Delete individual notes from the page or from the popup at any time. Removing
the extension (`chrome://extensions`) deletes everything stored on the device.
If you had connected Google Drive, disconnect first with "Also delete the copy
in Google Drive", or delete the hidden app data from Google Drive's settings.

## Changes

If this policy ever changes, the new version will be published at this address
and the change will be visible in the repository history.

## Contact

Questions or concerns: open an issue at
https://github.com/thundermiracle/fukidashi/issues
