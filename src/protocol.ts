// The message protocol of the payment page (gateway docs/20-pay.md, 20.9) without React: link checks, message
// parsing, the once-only status logic and the window listener. Used by <PspCheckout> and mountPspCheckout().
//   message = { source: 'psp-checkout', v: 1, type: 'ready' | 'status' | 'resize' | 'error', …fields of the type }
import type {
  InvoiceStatus,
  PspCheckoutCallbacks,
  PspCheckoutErrorCode,
  PspCheckoutEvent,
  PspCheckoutStatusSource,
} from './types';

/** `source` of every message of the payment page. */
export const MESSAGE_SOURCE = 'psp-checkout';
/** Protocol version `v` this package understands. */
export const PROTOCOL_VERSION = 1;
/** Largest iframe height the page can ask for, px. */
export const MAX_HEIGHT = 4000;
/** Iframe height until the first `resize` message, px. */
export const DEFAULT_MIN_HEIGHT = 480;
/** Accessible name of the iframe. */
export const DEFAULT_TITLE = 'Payment';

const STATUSES: ReadonlySet<unknown> = new Set<InvoiceStatus>([
  'active',
  'partially_paid',
  'paid',
  'overpaid',
  'expired',
  'expired_partial',
  'cancelled',
]);
const PAID: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>(['paid', 'overpaid']);
const EXPIRED: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>(['expired', 'expired_partial']);
const ERROR_CODES: ReadonlySet<unknown> = new Set<PspCheckoutErrorCode>([
  'link_invalid',
  'link_expired',
  'not_found',
  'unavailable',
]);
// Plain http is for a payment page running on the developer's machine only
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
// A token is at most 4096 characters (20.2); the rest is the page address
const MAX_URL_LENGTH = 8192;

/**
 * Origin of a payment page link, or `null` when `url` is not one: an absolute `https:` URL (`http:` on localhost),
 * without a login or password, with the token after `#`. The token itself is checked by the page.
 */
export function checkoutOrigin(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const secure = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname));
  if (!secure || parsed.username !== '' || parsed.password !== '' || parsed.hash.length <= 1) return null;
  return parsed.origin;
}

const isStatus = (value: unknown): value is InvoiceStatus => STATUSES.has(value);
const isErrorCode = (value: unknown): value is PspCheckoutErrorCode => ERROR_CODES.has(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * A message of the payment page reduced to its documented fields, or `null` for anything else: another `source`,
 * another protocol version, an unknown `type`, status or error code, or a field of a wrong type.
 */
export function parseMessage(data: unknown): PspCheckoutEvent | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message['source'] !== MESSAGE_SOURCE || message['v'] !== PROTOCOL_VERSION) return null;
  switch (message['type']) {
    case 'ready': {
      const { status, invoiceId, linkExpiresAt } = message;
      if (!isStatus(status) || !isText(invoiceId) || !isText(linkExpiresAt)) return null;
      return { type: 'ready', status, invoiceId, linkExpiresAt };
    }
    case 'status': {
      const { status, invoiceId, paidAt } = message;
      if (!isStatus(status) || !isText(invoiceId)) return null;
      if (paidAt !== undefined && paidAt !== null && !isText(paidAt)) return null;
      return { type: 'status', status, invoiceId, paidAt: paidAt ?? null };
    }
    case 'resize': {
      const { height } = message;
      if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null;
      return { type: 'resize', height };
    }
    case 'error': {
      const { code } = message;
      return isErrorCode(code) ? { type: 'error', code } : null;
    }
    default:
      return null;
  }
}

/** The iframe height for a `resize` message: whole pixels, at most {@link MAX_HEIGHT}. */
export const clampHeight = (height: number): number => Math.min(Math.ceil(height), MAX_HEIGHT);

/** `minHeight` option: a non-negative number of pixels up to {@link MAX_HEIGHT}, otherwise the default. */
export const initialHeight = (minHeight: unknown): number =>
  typeof minHeight === 'number' && Number.isFinite(minHeight) && minHeight >= 0
    ? clampHeight(minHeight)
    : DEFAULT_MIN_HEIGHT;

/**
 * Calls a callback of the merchant. An exception does not stop the other callbacks of the message: it is thrown
 * again from a timer, so it still reaches the console and error trackers (`window.onerror`).
 */
export function invoke<A extends unknown[]>(callback: ((...args: A) => void) | undefined, ...args: A): void {
  if (callback === undefined) return;
  try {
    callback(...args);
  } catch (error) {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

/**
 * State of one page load: the last status and the once-only `onPaid` / `onExpired`. Returns the handler of checked
 * messages. A new link needs a new session.
 */
export function createSession(
  callbacks: () => PspCheckoutCallbacks,
  setHeight: (height: number) => void,
): (event: PspCheckoutEvent) => void {
  let status: InvoiceStatus | undefined;
  let paid = false;
  let expired = false;

  const onStatus = (event: PspCheckoutStatusSource): void => {
    if (event.status !== status) {
      status = event.status;
      invoke(callbacks().onStatusChange, event.status, event);
    }
    if (!paid && PAID.has(event.status)) {
      paid = true;
      invoke(callbacks().onPaid, event);
    }
    if (!expired && EXPIRED.has(event.status)) {
      expired = true;
      invoke(callbacks().onExpired, event);
    }
  };

  return (event) => {
    switch (event.type) {
      case 'ready':
        invoke(callbacks().onReady, event);
        onStatus(event);
        return;
      case 'status':
        onStatus(event);
        return;
      case 'resize':
        setHeight(clampHeight(event.height));
        return;
      case 'error':
        invoke(callbacks().onError, event.code, event);
        return;
    }
  };
}

/**
 * Listens to `message` events of `target` and passes on only those of the payment page in `frame`: the origin of
 * the link, the window of that iframe, and a valid message. Returns the function that stops listening.
 */
export function listenToFrame(
  target: Window,
  origin: string,
  frame: () => HTMLIFrameElement | null,
  handle: (event: PspCheckoutEvent) => void,
): () => void {
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.origin !== origin) return;
    const source = frame()?.contentWindow ?? null;
    if (source === null || event.source !== source) return;
    const message = parseMessage(event.data);
    if (message !== null) handle(message);
  };
  target.addEventListener('message', onMessage);
  return () => {
    target.removeEventListener('message', onMessage);
  };
}
