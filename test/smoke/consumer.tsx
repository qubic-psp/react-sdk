// Type-checked in the smoke project against the installed declarations and @types/react 18 or 19.
import { useState } from 'react';
import {
  PspCheckout,
  type InvoiceStatus,
  type PspCheckoutErrorCode,
  type PspCheckoutEvent,
  type PspCheckoutProps,
} from '@qubiq-psp/react';
import { PSP_CHECKOUT_ORIGIN, mountPspCheckout, type PspCheckoutInstance } from '@qubiq-psp/react/vanilla';

export function OrderPayment({ url }: { url: string }) {
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const [error, setError] = useState<PspCheckoutErrorCode | null>(null);
  const props: PspCheckoutProps = {
    url,
    title: 'Payment',
    minHeight: 520,
    className: 'checkout',
    style: { borderRadius: 12, maxWidth: 480 },
    onReady: (event) => setStatus(event.status),
    onStatusChange: (next, event) => setStatus(event.type === 'status' && event.paidAt !== null ? 'paid' : next),
    onPaid: (event) => setStatus(event.status),
    onExpired: () => setStatus('expired'),
    onError: (code, event) => setError(event?.code ?? code),
  };
  return (
    <div data-status={status ?? ''} data-error={error ?? ''}>
      <PspCheckout {...props} />
      <PspCheckout url={url} />
      <PspCheckout url={url} checkoutOrigin="http://localhost:5180" />
    </div>
  );
}

export const describeEvent = (event: PspCheckoutEvent): string =>
  event.type === 'resize' ? String(event.height) : event.type === 'error' ? event.code : event.status;

export const mount = (element: HTMLElement, url: string): PspCheckoutInstance =>
  mountPspCheckout(element, {
    url,
    checkoutOrigin: PSP_CHECKOUT_ORIGIN,
    onPaid: (event) => console.log(event.invoiceId),
  });
