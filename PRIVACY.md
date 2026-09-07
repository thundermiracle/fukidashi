# Privacy Policy for Fukidashi

**Last updated: September 8, 2026**

Fukidashi keeps your notes on your device. If you choose to sync them, it also
keeps a copy where your other browsers can read it: in your own Google Drive
account, or — encrypted with a code only you hold — on a small relay we run
for those who would rather not use Google. There is no account with us, no
analytics, and no tracking. The relay is the one server of ours, and it cannot
read what it holds.

## What Fukidashi stores, and where

When you highlight text or write a note, Fukidashi saves:

- the note text you write,
- the highlighted text, together with a small amount of surrounding page text
  used to find the highlight again on your next visit,
- the URL and title of the page the note belongs to,
- when the note was written, edited or deleted,
- one on/off setting for the extension.

All of this is stored locally in your browser through `chrome.storage.local`.
Unless you switch syncing on, it never leaves your device.

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

## Syncing with a sync code (optional)

Instead of Google Drive you can sync with a code. Once you create one on the
settings page, or enter one from another browser:

- The code stays on your device. From it Fukidashi derives two things: an id
  that names your notes on the relay, and a key. The relay only ever sees the
  id; the key never leaves the device, and neither leads back to the code.
- Your notes — the same set as above — are encrypted on your device with that
  key (AES-256-GCM) before they are sent, and decrypted only on a browser
  that has the code. The relay holds the encrypted form and cannot read it.
- The relay is run by the developer of Fukidashi on Cloudflare Workers. It
  keeps, per id, the encrypted notes and when they were last synced. As with
  any web request, Cloudflare records the address it came from and when, for
  a limited time, under Cloudflare's own privacy policy:
  https://www.cloudflare.com/privacypolicy/. We do not use those records for
  anything beyond keeping the relay running.
- The copy is updated a few seconds after you edit a note, and checked every
  15 minutes for what your other browsers wrote.
- Notes nobody has synced for 90 days are deleted from the relay. To delete
  them sooner, choose Disconnect on the settings page with "Also delete the
  notes on the relay".
- Anyone who has the code can read and change the notes, so treat it as you
  would a password. A lost code cannot be recovered: create a new one on a
  browser that still holds the notes.

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

On Firefox, switching syncing on — with Google Drive or with a sync code —
also asks for permission to send the addresses of annotated pages and the
text quoted from them, which is what the notes contain.

## Data removal

Delete individual notes from the page or from the popup at any time. Removing
the extension (`chrome://extensions`) deletes everything stored on the device.
If you had connected Google Drive, disconnect first with "Also delete the copy
in Google Drive", or delete the hidden app data from Google Drive's settings.
If you synced with a code, disconnect with "Also delete the notes on the
relay"; otherwise the relay deletes them 90 days after the last sync.

## Changes

If this policy ever changes, the new version will be published at this address
and the change will be visible in the repository history.

## Contact

Questions or concerns: open an issue at
https://github.com/thundermiracle/fukidashi/issues
