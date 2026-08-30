#!/usr/bin/env node
import { spawn } from "node:child_process";
/**
 * Gets a Chrome Web Store refresh token through the loopback flow.
 *
 * `wxt submit init` cannot do this any more: it asks Google for the
 * out-of-band redirect (urn:ietf:wg:oauth:2.0:oob), which Google stopped
 * accepting in January 2023. This asks for http://localhost instead, which is
 * what Google now tells installed apps to use.
 *
 * Run it, approve in the browser that opens, and it prints the refresh token.
 * Nothing is written to disk and nothing leaves your machine except the
 * exchange with Google.
 *
 *   node get-chrome-refresh-token.mjs
 *
 * Your OAuth client must be of type "Desktop app". A "Web application" client
 * works too, but only once you add this exact redirect URI to it:
 *   http://localhost:8976/
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";

const PORT = 8976;
const REDIRECT_URI = `http://localhost:${PORT}/`;
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

const base64url = (buffer) => buffer.toString("base64url");

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** Waits for Google to send the browser back here with the code. */
function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== "/") {
        response.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");

      const done = (message) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><meta charset="utf-8">
          <body style="font:16px system-ui;padding:3rem;text-align:center">${message}</body>`);
        server.close();
      };

      if (error) {
        done("Authorisation failed. Back to the terminal.");
        reject(new Error(`Google said: ${error}`));
      } else if (state !== expectedState) {
        done("That response did not belong to this request.");
        reject(new Error("state mismatch — start over"));
      } else if (!code) {
        done("No code came back.");
        reject(new Error("no authorization code in the redirect"));
      } else {
        done("Done. You can close this tab and go back to the terminal.");
        resolve(code);
      }
    });

    server.on("error", reject);
    server.listen(PORT);
  });
}

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(command, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" })
    .on("error", () => {})
    .unref();
}

const clientId = process.env.CHROME_CLIENT_ID || (await ask("Client ID: "));
const clientSecret = process.env.CHROME_CLIENT_SECRET || (await ask("Client secret: "));

if (!clientId || !clientSecret) {
  console.error("Both the client ID and the client secret are needed.");
  process.exit(1);
}

const verifier = base64url(randomBytes(32));
const challenge = base64url(createHash("sha256").update(verifier).digest());
const state = base64url(randomBytes(16));

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPE,
  // Without these two Google hands back an access token and no refresh token.
  access_type: "offline",
  prompt: "consent",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
}).toString();

console.log("\nApprove the request in the browser. If it did not open, use this URL:\n");
console.log(authUrl.toString());
console.log("\nAn 'unverified app' warning is expected — it is your own client.\n");
console.log(`Waiting on ${REDIRECT_URI} …`);

openBrowser(authUrl.toString());

const code = await waitForCode(state);

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: verifier,
  }),
});

const body = await response.json();

if (!response.ok || !body.refresh_token) {
  console.error("\nGoogle refused to issue a refresh token:");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log("\n─────────────────────────────────────────────");
console.log("CHROME_REFRESH_TOKEN");
console.log(body.refresh_token);
console.log("─────────────────────────────────────────────");
console.log("\nPut it in GitHub → Settings → Secrets and variables → Actions.");
console.log("Copy the line above exactly, with no leading or trailing spaces.\n");
