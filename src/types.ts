// Public types of the payment widget: the messages of the payment page (gateway docs/20-pay.md, 20.9) and the
// callbacks shared by <PspCheckout> and mountPspCheckout().

/**
 * Status of the invoice the payment page shows.
 * - `active` — waiting for the payment;
 * - `partially_paid` — less than the amount arrived, the buyer can pay the rest;
 * - `paid` / `overpaid` — the amount arrived (final);
 * - `expired` / `expired_partial` — the payment window closed with nothing or with a part paid (final);
 * - `cancelled` — you or the platform cancelled the invoice (final).
 */
export type InvoiceStatus =
  'active' | 'partially_paid' | 'paid' | 'overpaid' | 'expired' | 'expired_partial' | 'cancelled';

/**
 * Why the payment page cannot show the invoice.
 * - `link_invalid` — the link is broken, signed with a wrong or revoked key; also reported by the component itself
 *   when `url` is not a payment page link;
 * - `link_expired` — the link is past its expiry: build a new one on your server;
 * - `not_found` — no such invoice for the key of the link;
 * - `unavailable` — the platform is temporarily unavailable; the page retries by itself.
 */
export type PspCheckoutErrorCode = 'link_invalid' | 'link_expired' | 'not_found' | 'unavailable';

/** The page loaded the invoice for the first time. */
export interface PspCheckoutReadyEvent {
  type: 'ready';
  status: InvoiceStatus;
  /** Invoice id (uuid). */
  invoiceId: string;
  /** Expiry of the link, ISO 8601. */
  linkExpiresAt: string;
}

/** The status of the invoice changed. */
export interface PspCheckoutStatusEvent {
  type: 'status';
  status: InvoiceStatus;
  /** Invoice id (uuid). */
  invoiceId: string;
  /** Block time of the payment that completed the amount, ISO 8601; `null` while not paid. */
  paidAt: string | null;
}

/** The content height of the page changed; the component sets the iframe height by itself. */
export interface PspCheckoutResizeEvent {
  type: 'resize';
  /** Content height in CSS pixels. */
  height: number;
}

/** The page cannot show the invoice. */
export interface PspCheckoutErrorEvent {
  type: 'error';
  code: PspCheckoutErrorCode;
}

/** A message of the payment page, checked and reduced to the documented fields. */
export type PspCheckoutEvent =
  PspCheckoutReadyEvent | PspCheckoutStatusEvent | PspCheckoutResizeEvent | PspCheckoutErrorEvent;

/** An event that carries the invoice status: the first `ready` or a later `status`. */
export type PspCheckoutStatusSource = PspCheckoutReadyEvent | PspCheckoutStatusEvent;

/**
 * Callbacks of the widget. They are for the interface only: ship orders on the `invoice.paid` / `invoice.overpaid`
 * webhook on your server, never on a browser event.
 */
export interface PspCheckoutCallbacks {
  /** The page loaded the invoice (the first data). */
  onReady?: ((event: PspCheckoutReadyEvent) => void) | undefined;
  /** A new invoice status: the first one comes with `ready`, then every change. The same status is not repeated. */
  onStatusChange?: ((status: InvoiceStatus, event: PspCheckoutStatusSource) => void) | undefined;
  /** The invoice is `paid` or `overpaid`. Called once per `url`, also when the page opens on a paid invoice. */
  onPaid?: ((event: PspCheckoutStatusSource) => void) | undefined;
  /** The invoice is `expired` or `expired_partial`. Called once per `url`. */
  onExpired?: ((event: PspCheckoutStatusSource) => void) | undefined;
  /**
   * The page cannot show the invoice. `event` is absent when the component itself refused `url` (`link_invalid`).
   * Can repeat: e.g. `unavailable` while the page retries.
   */
  onError?: ((code: PspCheckoutErrorCode, event: PspCheckoutErrorEvent | undefined) => void) | undefined;
}
