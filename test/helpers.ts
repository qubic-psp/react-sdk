// Shared test data: a payment page link and messages of the page (gateway docs/20-pay.md, 20.9).
import { vi } from 'vitest';
import type { InvoiceStatus, PspCheckoutCallbacks } from '../src/types';

// The default checkoutOrigin of the package
export const ORIGIN = 'https://pay.psp.qubiq.cc';
// The token of vector 1 of gateway 20.4 in shape: v1.<payload>.<43 characters of signature>
export const URL_1 = `${ORIGIN}/#v1.eyJrIjoicHNwX3BrX3Rlc3RfM0tkOUxtMlF4N1J0NVZiOE53MUhjNFpwIn0.${'a'.repeat(43)}`;
export const URL_2 = `${ORIGIN}/#v1.eyJrIjoicHNwX3BrX3Rlc3RfM0tkOUxtMlF4N1J0NVZiOE53MUhjNFpwIn0.${'b'.repeat(43)}`;
export const INVOICE_ID = '97da92f5-45c0-411b-9ed5-6793b396cd5f';

export const message = (type: string, fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  source: 'psp-checkout',
  v: 1,
  type,
  ...fields,
});

export const ready = (status: InvoiceStatus = 'active'): Record<string, unknown> =>
  message('ready', { status, invoiceId: INVOICE_ID, linkExpiresAt: '2026-09-30T12:00:00.000Z' });

export const status = (value: InvoiceStatus, paidAt: string | null = null): Record<string, unknown> =>
  message('status', { status: value, invoiceId: INVOICE_ID, paidAt });

export const resize = (height: unknown): Record<string, unknown> => message('resize', { height });

/** Dispatches a `message` event on `window` as a frame would: `source` defaults to the window of `frame`. */
export function postFrom(
  frame: HTMLIFrameElement | null | undefined,
  data: unknown,
  { origin = ORIGIN, source = frame?.contentWindow ?? null }: { origin?: string; source?: Window | null } = {},
): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

type Callback<K extends keyof PspCheckoutCallbacks> = NonNullable<PspCheckoutCallbacks[K]>;

/** Typed spies for every callback. */
export const spies = () => ({
  onReady: vi.fn<Callback<'onReady'>>(),
  onStatusChange: vi.fn<Callback<'onStatusChange'>>(),
  onPaid: vi.fn<Callback<'onPaid'>>(),
  onExpired: vi.fn<Callback<'onExpired'>>(),
  onError: vi.fn<Callback<'onError'>>(),
});

/**
 * Calls `onSrc(iframe)` synchronously right after an iframe gets its `src` — the earliest moment the page could
 * post its first message. Restore with `vi.restoreAllMocks()`.
 */
export function onFrameSrc(onSrc: (iframe: HTMLIFrameElement) => void): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the element as `this` below
  const original = HTMLIFrameElement.prototype.setAttribute;
  vi.spyOn(HTMLIFrameElement.prototype, 'setAttribute').mockImplementation(function (
    this: HTMLIFrameElement,
    name: string,
    value: string,
  ) {
    original.call(this, name, value);
    if (name === 'src') onSrc(this);
  });
}
