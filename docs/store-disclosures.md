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
- **identity**: signs the user in to Google when they connect Google Drive on
  the settings page, through `chrome.identity.launchWebAuthFlow`. Unused until
  they do.
- **alarms**: a 15-minute timer that picks up what the user's other browsers
  synced. Nothing runs on it while sync is off.
- **Content scripts on all sites**: restore the highlights and show the
  annotation toolbar on whatever page the user annotates. Page content stays
  on the device.
- **Remote code**: none.

### Data usage

Everything below is collected only after the user connects Google Drive, and
goes to the user's own Google Drive — never to the developer.

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
  listing's data section from it. `connectDrive` asks for the two on Firefox
  before signing in.
- Privacy policy URL: the same as above.
- The release workflow uploads the sources zip alongside the build.
- Before submitting after a manifest change:
  `pnpm build:firefox && pnpm dlx web-ext lint --source-dir dist/firefox-mv2`.

## Google Cloud (the OAuth client)

- **Consent screen**: app name "Fukidashi", the logo from `public/icon/128.png`,
  the repository as home page, the privacy policy URL above, a support email.
  Publishing status **In production**: in testing only listed test users can
  sign in.
- **Scopes**: `openid`, `email`, `https://www.googleapis.com/auth/drive.appdata`.
  All three are non-sensitive, so no verification is needed; brand verification
  is optional and only affects how the consent screen looks.
- **Client**: type "Web application". Authorized redirect URIs:
  `https://<extension-id>.chromiumapp.org/` (Chrome and Brave; the store
  build's id) and the URL `browser.identity.getRedirectURL()` prints in a
  Firefox build, `https://<hash>.extensions.allizom.org/`.
- **Where the id goes**: `.env` for local builds (`WXT_GOOGLE_CLIENT_ID`, see
  `.env.example`) and the repository variable of the same name for the store
  builds. It is not a secret.
