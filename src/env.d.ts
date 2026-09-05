/** Build-time settings read from `.env`; see `.env.example` for what each one is. */
interface ImportMetaEnv {
  /** The OAuth client the Drive sync signs in with. */
  readonly WXT_GOOGLE_CLIENT_ID?: string;
  /** The store build's public key, so a dev build gets the same extension id. */
  readonly WXT_EXTENSION_KEY?: string;
}
