// <PspCheckout url> — the payment page of the platform in an iframe (gateway docs/20-pay.md, 20.1 and 20.9).
// The url comes from your server: psp.checkout.createUrl() of @qubiq/psp-sdk.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { DEFAULT_TITLE, checkoutOrigin, createSession, initialHeight, invoke, listenToFrame } from './protocol';
import type { PspCheckoutCallbacks } from './types';

/** Props of {@link PspCheckout}. */
export interface PspCheckoutProps extends PspCheckoutCallbacks {
  /**
   * Link to the payment page from your server: `psp.checkout.createUrl()` of `@qubiq/psp-sdk`,
   * `https://pay.…/#v1.<payload>.<signature>`. A new value loads the page again and resets `onPaid` / `onExpired`.
   */
  url: string;
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
 * The payment page in an iframe. Accepts messages only from the origin of `url` and from this iframe, sets the
 * iframe height by the page, and calls the callbacks. An invalid `url` renders nothing and calls
 * `onError('link_invalid')` once.
 *
 * Callbacks are for the interface only: ship orders on the `invoice.paid` / `invoice.overpaid` webhook.
 */
export function PspCheckout(props: PspCheckoutProps): ReactElement | null {
  const { url, title = DEFAULT_TITLE, minHeight, className, style } = props;
  const origin = useMemo(() => checkoutOrigin(url), [url]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The latest callbacks: new handler identities neither re-subscribe nor reload the iframe
  const callbacks = useRef<PspCheckoutCallbacks>(props);
  const refusedUrl = useRef<string | null>(null);
  // Height reported by the page, for the link it was reported for
  const [measured, setMeasured] = useState<{ url: string; height: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    if (origin === null) {
      // Once per refused url, also under StrictMode, which runs effects twice
      if (refusedUrl.current !== url) {
        refusedUrl.current = url;
        invoke(callbacks.current.onError, 'link_invalid', undefined);
      }
      return undefined;
    }
    refusedUrl.current = null;
    const handle = createSession(
      () => callbacks.current,
      (height) => {
        setMeasured((prev) => (prev?.url === url && prev.height === height ? prev : { url, height }));
      },
    );
    return listenToFrame(window, origin, () => frameRef.current, handle);
  }, [url, origin]);

  if (origin === null) return null;
  const height = measured?.url === url ? measured.height : initialHeight(minHeight);
  return (
    <iframe
      // A new link is a new iframe: a change of the part after `#` alone would not load the page again
      key={url}
      ref={frameRef}
      src={url}
      title={title}
      allow="clipboard-write"
      referrerPolicy="no-referrer"
      loading="eager"
      className={className}
      style={{ display: 'block', width: '100%', border: 0, ...style, height }}
    />
  );
}
