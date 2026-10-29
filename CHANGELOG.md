# Changelog

All notable changes to `@qubiq-psp/react` are documented here. The project follows [Semantic Versioning](https://semver.org/).

## 0.1.0 — unreleased

First version.

- `<PspCheckout url>` — the platform payment page in an iframe, for a link built by `psp.checkout.createUrl()` of `@qubiq-psp/sdk`:
  - only links of `checkoutOrigin` are shown: `https://pay.psp.qubiq.cc` by default (`PSP_CHECKOUT_ORIGIN`), the origin of your own stand otherwise;
  - the iframe gets `src` only after the message listener is in place: the server HTML and the first client render have no `src`, so the single `ready` of the page is never missed (also for an invoice paid earlier);
  - `allow="clipboard-write"`, `referrerpolicy="no-referrer"`, `loading="eager"`, no `sandbox`;
  - the height follows the `resize` messages of the page, up to 4000 px; `minHeight` until the first one;
  - a new `url` mounts a new iframe and resets the once-only callbacks.
- Messages of the page (protocol `v: 1`) are accepted only from `checkoutOrigin` and from the window of this iframe; every field is type-checked, unknown fields are dropped.
- Callbacks `onReady`, `onStatusChange`, `onPaid` (once, `paid` / `overpaid`), `onExpired` (once, `expired` / `expired_partial`) and `onError` (`link_invalid`, `link_expired`, `not_found`, `unavailable`). A throwing callback does not stop the others.
- An invalid `url` (another origin than `checkoutOrigin`; not `https:`, except `http:` on localhost; a login or password; no token after `#`) renders nothing and calls `onError('link_invalid')` once.
- `mountPspCheckout(element, options)` in `@qubiq-psp/react/vanilla` — the same widget without React, with the same `checkoutOrigin` and load order.
- Server rendering without browser globals; both entries are marked `'use client'`.
- React 18 and 19, ESM and CommonJS builds with type declarations, no runtime dependencies.
