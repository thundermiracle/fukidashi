/**
 * jsdom has no layout engine, so `Range.getBoundingClientRect` — which every
 * browser implements and the floating panels rely on — is missing. An empty
 * rect is enough: the tests assert behaviour, not pixel positions.
 */
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function emptyRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

/** For the same reason there is nothing to scroll, which is fine to ignore. */
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function noScrolling(): void {};
}
