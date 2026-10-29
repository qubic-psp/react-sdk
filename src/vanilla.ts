// mountPspCheckout(container, options) — the same widget as <PspCheckout> without React, for any other frontend:
// `import { mountPspCheckout } from '@qubiq/psp-react/vanilla'`.
import { DEFAULT_TITLE, createSession, initialHeight, invoke, linkOrigin, listenToFrame } from './protocol';
import type { PspCheckoutCallbacks } from './types';

/** Options of {@link mountPspCheckout}. */
export interface MountPspCheckoutOptions extends PspCheckoutCallbacks {
  /**
   * Link to the payment page from your server: `psp.checkout.createUrl()` of `@qubiq/psp-sdk`. Never take it from
   * the address bar, browser storage or messages.
   */
  url: string;
  /**
   * Origin of the payment page: `url` must have exactly this origin, and only its messages are accepted. Default
   * `https://pay.psp.qubiq.cc`. Pass the origin of your own payment page stand (plain `http:` only on localhost).
   */
  checkoutOrigin?: string | undefined;
  /** Accessible name of the iframe. Default `Payment`. */
  title?: string | undefined;
  /** Iframe height in px until the page reports its own height. Default 480. */
  minHeight?: number | undefined;
  /** Class of the iframe. */
  className?: string | undefined;
}

/** A mounted widget. */
export interface PspCheckoutInstance {
  /** The iframe, or `null` when `url` was refused (`onError('link_invalid')` was called). */
  readonly iframe: HTMLIFrameElement | null;
  /** Stops listening to the page and removes the iframe. Safe to call more than once. */
  destroy(): void;
}

const isElement = (value: unknown): value is Element =>
  typeof value === 'object' && value !== null && 'ownerDocument' in value && 'appendChild' in value;

/**
 * Appends the payment page in an iframe to `container` and reports its events to the callbacks, with the same
 * checks as `<PspCheckout>`: messages only from `checkoutOrigin` and from this iframe. The page starts loading only
 * after the listener is in place. For another link, call `destroy()` and mount again. A `url` that is not a link of
 * `checkoutOrigin` appends nothing and calls `onError('link_invalid')`.
 */
export function mountPspCheckout(container: Element, options: MountPspCheckoutOptions): PspCheckoutInstance {
  // A JavaScript caller may pass the null of a missed getElementById()
  if (!isElement(container)) throw new TypeError('mountPspCheckout: container must be a DOM element');
  const origin = linkOrigin(options.url, options.checkoutOrigin);
  if (origin === null) {
    invoke(options.onError, 'link_invalid', undefined);
    return { iframe: null, destroy: () => undefined };
  }

  const doc = container.ownerDocument;
  const iframe = doc.createElement('iframe');
  iframe.setAttribute('title', options.title ?? DEFAULT_TITLE);
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('loading', 'eager');
  if (options.className !== undefined) iframe.className = options.className;
  iframe.style.display = 'block';
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.height = `${initialHeight(options.minHeight)}px`;

  const handle = createSession(
    () => options,
    (height) => {
      iframe.style.height = `${height}px`;
    },
  );
  const stop = listenToFrame(doc.defaultView ?? window, origin, () => iframe, handle);
  container.appendChild(iframe);
  // Only now, with the listener in place, the page starts loading: its `ready` comes once and must not be lost
  iframe.setAttribute('src', options.url);

  let destroyed = false;
  return {
    iframe,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      iframe.remove();
    },
  };
}

export type {
  InvoiceStatus,
  PspCheckoutCallbacks,
  PspCheckoutErrorCode,
  PspCheckoutErrorEvent,
  PspCheckoutEvent,
  PspCheckoutReadyEvent,
  PspCheckoutResizeEvent,
  PspCheckoutStatusEvent,
  PspCheckoutStatusSource,
} from './types';
export { PSP_CHECKOUT_ORIGIN } from './protocol';
export { VERSION } from './version';
