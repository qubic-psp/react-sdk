// <PspCheckout url> — the payment page of the platform in an iframe (gateway docs/20-pay.md, 20.1 and 20.9).
// The url comes from your server: psp.checkout.createUrl() of @qubiq/psp-sdk.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import {
  DEFAULT_TITLE,
  PSP_CHECKOUT_ORIGIN,
  createSession,
  initialHeight,
  invoke,
  linkOrigin,
  listenToFrame,
} from './protocol';
import type { PspCheckoutCallbacks } from './types';

/** Props of {@link PspCheckout}. */
export interface PspCheckoutProps extends PspCheckoutCallbacks {
  /**
   * Link to the payment page from your server: `psp.checkout.createUrl()` of `@qubiq/psp-sdk`,
   * `https://pay.psp.qubiq.cc/#v1.<payload>.<signature>`. Never take it from the address bar, browser storage or
   * messages. A new value loads the page again and resets `onPaid` / `onExpired`.
   */
  url: string;
  /**
   * Origin of the payment page: `url` must have exactly this origin, and only its messages are accepted. Default
   * `https://pay.psp.qubiq.cc`. Pass the origin of your own payment page stand, e.g. `http://localhost:5180`
   * (plain `http:` only on localhost).
   */
  checkoutOrigin?: string | undefined;
  /** Accessible name of the iframe. Default `Payment`. */
  title?: string | undefined;
  /** Iframe height in px until the page reports its own height. Default 480. */
  minHeight?: number | undefined;
  /** Class of the iframe. */
  className?: string | undefined;
  /** Style of the iframe. `height` is set by the component; `width: 100%`, `border: 0` and `display: block` can be overridden. */
  style?: CSSProperties | undefined;
}

// Layout effects do not run in a server render (and React 18 warns there): plain effects on the server
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The payment page in an iframe. Accepts messages only from `checkoutOrigin` and from this iframe, sets the iframe
 * height by the page, and calls the callbacks. A `url` that is not a link of `checkoutOrigin` renders nothing and
 * calls `onError('link_invalid')` once.
 *
 * The page is loaded only after the component listens to it: the server HTML and the first client render have an
 * iframe without `src`, so the first message of the page is never missed.
 *
 * Callbacks are for the interface only: ship orders on the `invoice.paid` / `invoice.overpaid` webhook.
 */
export function PspCheckout(props: PspCheckoutProps): ReactElement | null {
  const { url, checkoutOrigin = PSP_CHECKOUT_ORIGIN, title = DEFAULT_TITLE, minHeight, className, style } = props;
  const origin = useMemo(() => linkOrigin(url, checkoutOrigin), [url, checkoutOrigin]);
  // What a refusal is reported for: once per refused pair of url and origin
  const refusal = origin === null ? `${checkoutOrigin}\n${url}` : null;
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The latest callbacks: new handler identities neither re-subscribe nor reload the iframe
  const callbacks = useRef<PspCheckoutCallbacks>(props);
  const reported = useRef<string | null>(null);
  // Height reported by the page, for the link it was reported for
  const [measured, setMeasured] = useState<{ url: string; height: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    if (origin === null) {
      // Once per refusal, also under StrictMode, which runs effects twice
      if (reported.current !== refusal) {
        reported.current = refusal;
        invoke(callbacks.current.onError, 'link_invalid', undefined);
      }
      return undefined;
    }
    reported.current = null;
    const handle = createSession(
      () => callbacks.current,
      (height) => {
        setMeasured((prev) => (prev?.url === url && prev.height === height ? prev : { url, height }));
      },
    );
    const stop = listenToFrame(window, origin, () => frameRef.current, handle);
    // Only now, with the listener in place, the page starts loading: its `ready` comes once and must not be lost.
    // React does not manage `src`, so a re-render never touches it; StrictMode's second run does not reload.
    const frame = frameRef.current;
    if (frame !== null && frame.getAttribute('src') !== url) frame.setAttribute('src', url);
    return stop;
  }, [url, origin, refusal]);

  if (origin === null) return null;
  const height = measured?.url === url ? measured.height : initialHeight(minHeight);
  return (
    <iframe
      // A new link is a new iframe: a change of the part after `#` alone would not load the page again
      key={url}
      ref={frameRef}
      title={title}
      allow="clipboard-write"
      referrerPolicy="no-referrer"
      loading="eager"
      className={className}
      style={{ display: 'block', width: '100%', border: 0, ...style, height }}
    />
  );
}
