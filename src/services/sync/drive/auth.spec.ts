import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeDrive } from "@/testing/fakeDrive";
import { SyncSignedOutError } from "../backend";
import {
  buildAuthRequest,
  createDriveBearerSource,
  DriveAuthError,
  type DriveToken,
  driveAuthOptions,
  loadDriveToken,
  readAuthResponse,
  renewDriveToken,
  saveDriveToken,
  signInToDrive,
  signOutOfDrive,
} from "./auth";

const HOUR = 3_600_000;
const NOW = 1_000_000;

let storage: ReturnType<typeof createFakeChromeStorage>;
let identity: ReturnType<typeof createFakeChromeIdentity>;
let drive: ReturnType<typeof createFakeDrive>;
let options: { clientId: string; redirectUrl: string; fetch: typeof fetch };

beforeEach(() => {
  storage = createFakeChromeStorage();
  identity = createFakeChromeIdentity();
  drive = createFakeDrive();
  vi.stubGlobal("chrome", { ...storage.chrome, ...identity.chrome });
  options = { clientId: "client-1", redirectUrl: identity.redirectUrl, fetch: drive.fetch };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildAuthRequest", () => {
  it("asks Google for a token for the app folder, sent back to the extension", () => {
    const { url, state } = buildAuthRequest(options);
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      client_id: "client-1",
      redirect_uri: identity.redirectUrl,
      response_type: "token",
      scope: "openid email https://www.googleapis.com/auth/drive.appdata",
      state,
      prompt: "select_account",
    });
  });

  it("asks silently, for the account already connected, when renewing", () => {
    const { url } = buildAuthRequest(options, { loginHint: "me@example.com" });
    const params = new URL(url).searchParams;

    expect(params.get("prompt")).toBe("none");
    expect(params.get("login_hint")).toBe("me@example.com");
  });

  it("gives every request a state of its own", () => {
    expect(buildAuthRequest(options).state).not.toBe(buildAuthRequest(options).state);
  });
});

describe("readAuthResponse", () => {
  const request = { url: "", state: "state-1" };
  const answer = (fragment: string) => `${identity.redirectUrl}#${fragment}`;

  it("reads the token and when it expires", () => {
    const response = answer("access_token=tok&token_type=Bearer&expires_in=3600&state=state-1");

    expect(readAuthResponse(response, request, NOW)).toEqual({
      accessToken: "tok",
      expiresAt: NOW + HOUR,
    });
  });

  it("refuses an answer to some other request", () => {
    const response = answer("access_token=tok&expires_in=3600&state=state-2");

    expect(() => readAuthResponse(response, request, NOW)).toThrow(DriveAuthError);
  });

  it("treats a session Google could not renew as signed out", () => {
    const errors = [
      "interaction_required",
      "login_required",
      "consent_required",
      "account_selection_required",
    ];
    for (const error of errors) {
      const response = answer(`error=${error}&state=state-1`);
      expect(() => readAuthResponse(response, request, NOW)).toThrow(SyncSignedOutError);
    }
  });

  it("says so when the user cancelled", () => {
    const response = answer("error=access_denied&state=state-1");

    expect(() => readAuthResponse(response, request, NOW)).toThrow("The sign-in was cancelled.");
  });

  it("refuses an answer without a token", () => {
    expect(() => readAuthResponse(undefined, request, NOW)).toThrow(DriveAuthError);
    expect(() => readAuthResponse(answer("state=state-1"), request, NOW)).toThrow(DriveAuthError);
  });
});

describe("signInToDrive", () => {
  it("remembers the token and the account it belongs to", async () => {
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");

    const token = await signInToDrive(options, NOW);

    expect(token).toEqual({ accessToken: "tok-1", expiresAt: NOW + HOUR, email: "me@example.com" });
    expect(identity.calls[0]).toMatchObject({ interactive: true });
    await expect(loadDriveToken()).resolves.toEqual(token);
  });

  it("keeps nothing when the sign-in did not go through", async () => {
    identity.answerWith((state) => `error=access_denied&state=${state}`);

    await expect(signInToDrive(options, NOW)).rejects.toThrow(DriveAuthError);
    await expect(loadDriveToken()).resolves.toBeNull();
  });

  it("reports the window being closed the same way as a refusal", async () => {
    identity.refuse(new Error("The user did not approve access."));

    await expect(signInToDrive(options, NOW)).rejects.toThrow(
      new DriveAuthError("The user did not approve access."),
    );
    await expect(loadDriveToken()).resolves.toBeNull();
  });
});

describe("renewDriveToken", () => {
  const current: DriveToken = { accessToken: "old", expiresAt: NOW, email: "me@example.com" };

  it("gets a new token without showing anything, keeping the account", async () => {
    identity.answerWith((state) => `access_token=tok-2&expires_in=3600&state=${state}`);

    const token = await renewDriveToken(options, current, NOW);

    expect(token).toEqual({ accessToken: "tok-2", expiresAt: NOW + HOUR, email: "me@example.com" });
    expect(identity.calls[0]).toMatchObject({ interactive: false });
    expect(new URL(identity.calls[0].url).searchParams.get("login_hint")).toBe("me@example.com");
    await expect(loadDriveToken()).resolves.toEqual(token);
  });

  it("is signed out when Google says the session is gone", async () => {
    identity.answerWith((state) => `error=login_required&state=${state}`);

    await expect(renewDriveToken(options, current, NOW)).rejects.toThrow(SyncSignedOutError);
  });

  it("is signed out when the browser would have had to show a window", async () => {
    identity.refuse(new Error("User interaction required."));

    await expect(renewDriveToken(options, current, NOW)).rejects.toThrow(SyncSignedOutError);
  });
});

describe("createDriveBearerSource", () => {
  const clock = () => NOW;

  it("hands out the stored token while it is fresh", async () => {
    await saveDriveToken({ accessToken: "tok-1", expiresAt: NOW + HOUR, email: "me@example.com" });

    await expect(createDriveBearerSource(options, clock).current()).resolves.toBe("tok-1");
    expect(identity.calls).toHaveLength(0);
  });

  it("renews a token about to expire before handing it out", async () => {
    await saveDriveToken({
      accessToken: "tok-1",
      expiresAt: NOW + 60_000,
      email: "me@example.com",
    });
    identity.answerWith((state) => `access_token=tok-2&expires_in=3600&state=${state}`);

    await expect(createDriveBearerSource(options, clock).current()).resolves.toBe("tok-2");
    expect(identity.calls).toHaveLength(1);
  });

  it("renews on request, after Google refused the token", async () => {
    await saveDriveToken({ accessToken: "tok-1", expiresAt: NOW + HOUR, email: "me@example.com" });
    identity.answerWith((state) => `access_token=tok-2&expires_in=3600&state=${state}`);

    await expect(createDriveBearerSource(options, clock).renewed()).resolves.toBe("tok-2");
    await expect(loadDriveToken()).resolves.toMatchObject({ accessToken: "tok-2" });
  });

  it("is signed out without a token", async () => {
    const bearer = createDriveBearerSource(options, clock);

    await expect(bearer.current()).rejects.toThrow(SyncSignedOutError);
    await expect(bearer.renewed()).rejects.toThrow(SyncSignedOutError);
  });
});

describe("signOutOfDrive", () => {
  it("forgets the token and tells Google", async () => {
    await saveDriveToken({ accessToken: "tok-1", expiresAt: NOW + HOUR, email: "me@example.com" });

    await signOutOfDrive({ fetch: drive.fetch });

    await expect(loadDriveToken()).resolves.toBeNull();
    expect(drive.requests).toEqual([
      { method: "POST", url: "https://oauth2.googleapis.com/revoke?token=tok-1" },
    ]);
  });

  it("forgets the token even when Google cannot be reached", async () => {
    await saveDriveToken({ accessToken: "tok-1", expiresAt: NOW + HOUR, email: "me@example.com" });
    const offline: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(signOutOfDrive({ fetch: offline })).resolves.toBeUndefined();
    await expect(loadDriveToken()).resolves.toBeNull();
  });

  it("has nothing to tell Google without a token", async () => {
    await signOutOfDrive({ fetch: drive.fetch });

    expect(drive.requests).toEqual([]);
  });
});

describe("driveAuthOptions", () => {
  it("refuses to sign in from a build without a client id", () => {
    vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "");

    expect(() => driveAuthOptions()).toThrow(/client id/);
  });

  it("uses the client id the build was made with, and the extension's own redirect", () => {
    vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "client-1");

    expect(driveAuthOptions()).toEqual({ clientId: "client-1", redirectUrl: identity.redirectUrl });
  });
});
