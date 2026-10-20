import { describe, expect, it } from "vitest";
import { canAnnotateUrl, formatPagePath, formatPageUrl, normalizePageUrl, pageHost } from "./url";

describe("normalizePageUrl", () => {
  it("drops the hash so in-page links share one set of notes", () => {
    expect(normalizePageUrl("https://example.com/docs?page=2#section-3")).toBe(
      "https://example.com/docs?page=2",
    );
  });

  it("keeps the query string, which usually selects the content", () => {
    expect(normalizePageUrl("https://example.com/search?q=fukidashi")).toBe(
      "https://example.com/search?q=fukidashi",
    );
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(normalizePageUrl("not a url")).toBe("not a url");
  });

  describe("Google Translate", () => {
    it("gives a translated page the notes of the page it was translated from", () => {
      expect(
        normalizePageUrl(
          "https://example-com.translate.goog/docs?_x_tr_sl=en&_x_tr_tl=ja&_x_tr_hl=ja",
        ),
      ).toBe("https://example.com/docs");
    });

    it("reads a doubled dash as a dash in the original host", () => {
      expect(normalizePageUrl("https://www-mail--archive-com.translate.goog/")).toBe(
        "https://www.mail-archive.com/",
      );
    });

    it("keeps the page's own query parameters", () => {
      expect(
        normalizePageUrl("https://example-com.translate.goog/search?q=fukidashi&_x_tr_tl=ja"),
      ).toBe("https://example.com/search?q=fukidashi");
    });

    it("restores the scheme the proxy recorded", () => {
      expect(normalizePageUrl("https://example-com.translate.goog/?_x_tr_sch=http")).toBe(
        "http://example.com/",
      );
    });

    it("leaves other hosts alone", () => {
      expect(normalizePageUrl("https://translate.google.com/?sl=en")).toBe(
        "https://translate.google.com/?sl=en",
      );
    });

    it("is unchanged by a second pass", () => {
      const once = normalizePageUrl("https://example-com.translate.goog/docs?_x_tr_tl=ja");
      expect(normalizePageUrl(once)).toBe(once);
    });
  });
});

describe("formatPageUrl", () => {
  it("shows host and path", () => {
    expect(formatPageUrl("https://example.com/docs/intro")).toBe("example.com/docs/intro");
  });

  it("omits a bare root path", () => {
    expect(formatPageUrl("https://example.com/")).toBe("example.com");
  });
});

describe("pageHost", () => {
  it("is the site the page belongs to", () => {
    expect(pageHost("https://example.com/docs/intro?page=2")).toBe("example.com");
  });
});

describe("formatPagePath", () => {
  it("is what tells two pages of one site apart", () => {
    expect(formatPagePath("https://example.com/docs/intro?page=2")).toBe("/docs/intro?page=2");
  });
});

describe("canAnnotateUrl", () => {
  it("takes any web page", () => {
    expect(canAnnotateUrl("https://example.com/docs")).toBe(true);
    expect(canAnnotateUrl("http://localhost:3000/")).toBe(true);
  });

  it("knows the browser's own pages carry no notes", () => {
    expect(canAnnotateUrl("chrome://extensions/")).toBe(false);
    expect(canAnnotateUrl("about:addons")).toBe(false);
    expect(canAnnotateUrl("chrome-extension://abc/options.html")).toBe(false);
    expect(canAnnotateUrl("file:///Users/me/notes.html")).toBe(false);
    expect(canAnnotateUrl("not a url")).toBe(false);
  });

  it("knows the extension stores keep extensions out", () => {
    expect(canAnnotateUrl("https://chromewebstore.google.com/detail/abc")).toBe(false);
    expect(canAnnotateUrl("https://chrome.google.com/webstore/detail/abc")).toBe(false);
    expect(canAnnotateUrl("https://addons.mozilla.org/en-US/firefox/")).toBe(false);
    expect(canAnnotateUrl("https://microsoftedge.microsoft.com/addons/detail/abc")).toBe(false);
  });

  it("does not mistake the rest of those sites for their stores", () => {
    expect(canAnnotateUrl("https://chrome.google.com/")).toBe(true);
    expect(canAnnotateUrl("https://microsoftedge.microsoft.com/")).toBe(true);
  });
});
