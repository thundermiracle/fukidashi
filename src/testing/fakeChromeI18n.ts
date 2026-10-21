import en from "../../public/_locales/en/messages.json";
import ja from "../../public/_locales/ja/messages.json";

type Catalogue = Record<string, { message: string }>;

const CATALOGUES: Record<"en" | "ja", Catalogue> = { en, ja };

/**
 * chrome.i18n reading the extension's own catalogues: English unless a test
 * asks for another language, so the tests assert in the words the UI really
 * shows. A message the language lacks comes from English, as the browser
 * falls back to the default locale.
 */
export function createFakeChromeI18n(language: keyof typeof CATALOGUES = "en") {
  const messages = CATALOGUES[language];

  return {
    chrome: {
      i18n: {
        getMessage: (name: string) => messages[name]?.message ?? CATALOGUES.en[name]?.message ?? "",
        getUILanguage: () => language,
      },
    },
  };
}
