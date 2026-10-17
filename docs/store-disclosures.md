# Store disclosures

What the store forms ask, and what to answer, now that the extension can send
the notes to the user's own Google Drive. Keep this in step with `PRIVACY.md`.

## Chrome Web Store

### Permission justifications (Privacy practices tab)

- **Single purpose**: annotate web pages with highlights and notes, and keep
  those notes across the user's browsers.
- **storage**: saves the notes and the on/off setting on the device.
- **activeTab**: lets the popup read the current tab's address and message its
  content script, to list and scroll to the notes on the page in view.
- **identity**: Signs the user in to Google when they choose to connect Google
  Drive on the settings page, through chrome.identity.launchWebAuthFlow, so
  their notes can be synced through their own Drive app folder. It is unused
  until the user connects.
- **alarms**: A 15-minute timer that picks up the notes the user's other
  browsers synced to their Google Drive. Nothing runs on it while sync is off.
- **Host permission** (the content script on all sites): The content script
  must run on every page because users can annotate any website: on page load
  it restores the highlights and notes previously saved for that page, and it
  shows the selection toolbar when text is selected. The set of pages a user
  will annotate cannot be known in advance, so a narrower match list is not
  possible. Page content is processed on the device and is not read for any
  other purpose. The only data that leaves the device is the user's own notes
  (the note text, the highlighted text with a little surrounding text, and the
  page URL and title), and only after the user connects Google Drive on the
  settings page; they are then written to the user's own Google Drive app
  folder, never to the developer.
- **Remote code**: No.

The dashboard only lets an item be submitted once every permission in the
uploaded package has a justification here, so a new permission means a new
answer before the release that adds it. An earlier answer that said nothing
leaves the device stopped being true with the sync; keep these in step with
what the build does.

### Data usage

Everything below is collected only after the user connects Google Drive.
The notes go to the user's own Google Drive and never to the developer.
The privacy policy describes the data and optional passphrase encryption.

| Category | Answer |
| --- | --- |
| Web history | Yes: the URLs of the pages the user annotated |
| Website content | Yes: the text the user highlighted, with a little surrounding text |
| Personally identifiable information | Yes: the email address of the connected Google account, kept on the device to show which account is connected |
| Authentication information | Yes: the Google sign-in token, kept on the device |
| User activity, location, health, financial, personal communications | No |

Certifications: not sold to third parties; not used or transferred for
purposes unrelated to the item's core functionality; not used to determine
creditworthiness or for lending.

Privacy policy URL: https://github.com/thundermiracle/fukidashi/blob/main/PRIVACY.md

## Firefox Add-ons (AMO)

- The manifest declares `data_collection_permissions` with `required: ["none"]`
  and `optional: ["browsingActivity", "websiteContent"]`; AMO builds the
  listing's data section from it. Connecting Google Drive asks for the two
  on Firefox first.
- Privacy policy URL: the same as above.
- The release workflow uploads the sources zip alongside the build.
- Before submitting after a manifest change:
  `pnpm build:firefox && pnpm dlx web-ext lint --source-dir dist/firefox-mv2`.

## Google Cloud (the OAuth client)

- **The client stays put**: Drive's app folder belongs to the Cloud project, not
  to the account, so a client in another project sees an empty folder. Moving
  to a new client would make every connected browser sign in again and rebuild
  the copy in Drive from its own notes. 0.4.0 shipped with a client in the
  wrong project and no store redirect URI; 0.4.1 moved to the current one
  before anyone could connect, which is the only cheap moment to move.
- **APIs**: Google Drive API enabled in the same project.
- **Consent screen**: app name "Fukidashi", the privacy policy URL above, a
  support email, no logo and no home page. Publishing status
  **In production**: in testing only listed test users can sign in.
- **Brand verification**: not done, and not needed to sign in. It failed on
  the home page (`github.com` cannot be verified as ours in Search Console)
  and on the logo (the icon was judged not to identify the brand). Showing a
  name and logo on the consent screen would take a home page and privacy
  policy on a domain of our own, verified in Search Console, and a logo of
  our own design.
- **Scopes**: `openid`, `email`, `https://www.googleapis.com/auth/drive.appdata`.
  All three are non-sensitive, so the scopes need no verification.
- **Client**: type "Web application". Authorized redirect URIs:
  - `https://fnlmnompnmmkobkoooilpkeddbfdgdfd.chromiumapp.org/`: Chrome and
    Brave, the Chrome Web Store item's id;
  - `https://a3e342fbf40f7caf4012f064891e60627bbf2438.extensions.allizom.org/`:
    Firefox, the SHA-1 of the add-on id `fukidashi@thundermiracle.com`, which
    is what `browser.identity.getRedirectURL()` returns.
- **Where the id goes**: `.env` for local builds (`WXT_GOOGLE_CLIENT_ID`, see
  `.env.example`) and the repository variable of the same name for the store
  builds. It is not a secret. The released builds read the variable at
  release time, so update it before merging the version bump.
- **A dev build with the store id**: `WXT_EXTENSION_KEY` in `.env` must be the
  item's public key (dashboard → Package → View public key, on one line
  without the PEM header). The id it gives is the first 32 hex digits of the
  SHA-256 of the decoded key, with `0`–`f` read as `a`–`p`:

  ```sh
  k=$(grep '^WXT_EXTENSION_KEY=' .env | cut -d= -f2-)
  [ -n "$k" ] && printf '%s' "$k" | base64 -D | shasum -a 256 | head -c 32 | tr 0-9a-f a-p
  ```

  It has to print `fnlmnompnmmkobkoooilpkeddbfdgdfd`. Without the emptiness
  check an empty key prints `odlameecjipmbmbejkplpemijjgpljce`, the hash of
  nothing, which looks like a real id but belongs to no item.
