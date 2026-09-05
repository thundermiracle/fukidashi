import { generateId } from "@/core";
import { SyncSignedOutError } from "../backend";

/** What signing in leaves behind on this device. Never synced. */
export interface DriveToken {
  accessToken: string;
  /** When Google stops accepting `accessToken`. */
  expiresAt: number;
  /** Which account this device is connected to, for the settings page to show. */
  email: string;
}

export interface DriveAuthOptions {
  clientId: string;
  /** Where Google sends the browser back to: `chrome.identity.getRedirectURL()`. */
  redirectUrl: string;
  fetch?: typeof fetch;
}

export const DRIVE_TOKEN_KEY = "fukidashi:sync:drive";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
/** The app folder, plus enough identity to show which account is connected. */
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.appdata"];
/** A token this close to expiring is renewed first, so a sync never starts on one about to die. */
const RENEW_MARGIN_MS = 5 * 60_000;

/** What Google answers a `prompt=none` request with when there is no session to renew from. */
const SIGNED_OUT_ERRORS = [
  "interaction_required",
  "login_required",
  "consent_required",
  "account_selection_required",
];

/** Thrown when Google answered, but not with a token. */
export class DriveAuthError extends Error {}

export interface AuthRequest {
  url: string;
  /** Echoed back by Google; an answer carrying anything else is not to this request. */
  state: string;
}

/**
 * The implicit flow: the token comes back in the fragment of the redirect,
 * which `launchWebAuthFlow` captures without ever loading it as a page.
 * There is no client secret to keep, which is all an extension can offer;
 * the authorization-code flow needs one for a web client, PKCE or not.
 */
export function buildAuthRequest(
  options: DriveAuthOptions,
  silent: { loginHint: string } | null = null,
): AuthRequest {
  const state = generateId();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUrl);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  if (silent) {
    url.searchParams.set("prompt", "none");
    url.searchParams.set("login_hint", silent.loginHint);
  } else {
    url.searchParams.set("prompt", "select_account");
  }
  return { url: url.toString(), state };
}

/**
 * Reads the token out of the redirect Google sent the browser to. A silent
 * request that Google could not answer without the user comes back as
 * `interaction_required` or `login_required`: that is the signed-out case.
 */
export function readAuthResponse(
  responseUrl: string | undefined,
  request: AuthRequest,
  now: number,
): Pick<DriveToken, "accessToken" | "expiresAt"> {
  if (!responseUrl) throw new DriveAuthError("Google did not answer the sign-in.");

  const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  if (params.get("state") !== request.state) {
    throw new DriveAuthError("The sign-in answer did not belong to this request.");
  }

  const error = params.get("error");
  if (error && SIGNED_OUT_ERRORS.includes(error)) throw new SyncSignedOutError();
  if (error === "access_denied") throw new DriveAuthError("The sign-in was cancelled.");
  if (error) throw new DriveAuthError(`Google refused the sign-in (${error}).`);

  const accessToken = params.get("access_token");
  const expiresIn = Number(params.get("expires_in"));
  if (!accessToken || !Number.isFinite(expiresIn)) {
    throw new DriveAuthError("Google did not hand back a token.");
  }
  return { accessToken, expiresAt: now + expiresIn * 1000 };
}

export async function loadDriveToken(): Promise<DriveToken | null> {
  const stored = await chrome.storage.local.get(DRIVE_TOKEN_KEY);
  const token = stored[DRIVE_TOKEN_KEY] as Partial<DriveToken> | undefined;
  if (
    typeof token?.accessToken !== "string" ||
    typeof token.expiresAt !== "number" ||
    typeof token.email !== "string"
  ) {
    return null;
  }
  return { accessToken: token.accessToken, expiresAt: token.expiresAt, email: token.email };
}

/** Writes the token, or forgets it when given null. */
export async function saveDriveToken(token: DriveToken | null): Promise<void> {
  if (token) {
    await chrome.storage.local.set({ [DRIVE_TOKEN_KEY]: token });
  } else {
    await chrome.storage.local.remove(DRIVE_TOKEN_KEY);
  }
}

export function isTokenFresh(token: DriveToken, now: number): boolean {
  return token.expiresAt - now > RENEW_MARGIN_MS;
}

async function fetchEmail(accessToken: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new DriveAuthError("Could not read which Google account signed in.");
  const info = (await response.json()) as { email?: unknown };
  return typeof info.email === "string" ? info.email : "";
}

/** Asks the user to sign in, and remembers the token this device was given. */
export async function signInToDrive(
  options: DriveAuthOptions,
  now: number = Date.now(),
): Promise<DriveToken> {
  const request = buildAuthRequest(options);
  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url: request.url, interactive: true });
  } catch (error) {
    // The browser rejects when the user closes the window, which is the
    // same thing as Google answering access_denied.
    throw new DriveAuthError(
      error instanceof Error && error.message ? error.message : "The sign-in was cancelled.",
    );
  }
  const granted = readAuthResponse(responseUrl, request, now);
  const token = {
    ...granted,
    email: await fetchEmail(granted.accessToken, options.fetch ?? fetch),
  };
  await saveDriveToken(token);
  return token;
}

/**
 * Gets a fresh token without bothering the user, which works as long as the
 * browser still holds a Google session for the account. Throws
 * `SyncSignedOutError` otherwise; the old token stays on record, so the
 * settings page can still say which account to sign back in to.
 */
export async function renewDriveToken(
  options: DriveAuthOptions,
  current: DriveToken,
  now: number = Date.now(),
): Promise<DriveToken> {
  const request = buildAuthRequest(options, { loginHint: current.email });
  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url: request.url, interactive: false });
  } catch {
    // The browser would have had to show a window, which a silent request
    // may not — there is no session to renew from.
    throw new SyncSignedOutError();
  }
  const token = { ...readAuthResponse(responseUrl, request, now), email: current.email };
  await saveDriveToken(token);
  return token;
}

/**
 * Forgets the token and tells Google to as well. Google refusing — the token
 * may be long expired — is not worth stopping for: what mattered is that
 * this device no longer has it.
 */
export async function signOutOfDrive(options: { fetch?: typeof fetch } = {}): Promise<void> {
  const token = await loadDriveToken();
  await saveDriveToken(null);
  if (!token) return;
  try {
    await (options.fetch ?? fetch)(
      `${REVOKE_ENDPOINT}?token=${encodeURIComponent(token.accessToken)}`,
      { method: "POST" },
    );
  } catch {
    // Offline, most likely. The token dies on its own within the hour.
  }
}

/** Where the Drive client gets the bearer for each request. */
export interface BearerSource {
  /** A token good for a request now; renewed first if the stored one is about to expire. */
  current(): Promise<string>;
  /** A new token, after Google refused the current one. */
  renewed(): Promise<string>;
}

export function createDriveBearerSource(
  options: DriveAuthOptions,
  now: () => number = Date.now,
): BearerSource {
  const stored = async (): Promise<DriveToken> => {
    const token = await loadDriveToken();
    if (!token) throw new SyncSignedOutError();
    return token;
  };

  return {
    async current() {
      const token = await stored();
      if (isTokenFresh(token, now())) return token.accessToken;
      return (await renewDriveToken(options, token, now())).accessToken;
    },
    async renewed() {
      return (await renewDriveToken(options, await stored(), now())).accessToken;
    },
  };
}

/**
 * The client this build was made with, and where the browser sends Google's
 * answer. The client id comes from `.env` (see `.env.example`); it is not a
 * secret, but a fork should not share it.
 */
export function driveAuthOptions(): DriveAuthOptions {
  const clientId = import.meta.env.WXT_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("This build of Fukidashi has no Google client id, so it cannot sign in.");
  }
  return { clientId, redirectUrl: chrome.identity.getRedirectURL() };
}
