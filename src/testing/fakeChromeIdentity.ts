type Details = chrome.identity.WebAuthFlowDetails;

/**
 * In-memory stand-in for chrome.identity. A test says how Google answers —
 * with a token, with an error, or by needing a window the silent flow may
 * not open — and the request's `state` is echoed back the way Google does.
 */
export function createFakeChromeIdentity(redirectUrl = "https://extension-id.chromiumapp.org/") {
  const calls: Details[] = [];
  let answer: (details: Details) => Promise<string | undefined> = async () => undefined;

  return {
    calls,
    redirectUrl,
    /** Google redirects back with this fragment; `state` is the one the request carried. */
    answerWith: (fragment: (state: string) => string) => {
      answer = async (details) => {
        const state = new URL(details.url).searchParams.get("state") ?? "";
        return `${redirectUrl}#${fragment(state)}`;
      };
    },
    /** The browser refuses the flow, as it does when a silent one needs a window. */
    refuse: (error: Error) => {
      answer = async () => {
        throw error;
      };
    },
    chrome: {
      identity: {
        getRedirectURL: () => redirectUrl,
        launchWebAuthFlow: async (details: Details) => {
          calls.push(details);
          return answer(details);
        },
      },
    },
  };
}
