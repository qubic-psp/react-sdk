// The public API as a merchant sees it through the package entries: props, callbacks and the event union.
import type { ComponentProps, ReactElement } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import {
  PspCheckout,
  type InvoiceStatus,
  type PspCheckoutErrorCode,
  type PspCheckoutErrorEvent,
  type PspCheckoutEvent,
  type PspCheckoutProps,
  type PspCheckoutReadyEvent,
  type PspCheckoutResizeEvent,
  type PspCheckoutStatusEvent,
  type PspCheckoutStatusSource,
} from '../../src/index';
import { mountPspCheckout, type MountPspCheckoutOptions, type PspCheckoutInstance } from '../../src/vanilla';

describe('public API', () => {
  it('statuses and error codes are closed unions', () => {
    expectTypeOf<InvoiceStatus>().toEqualTypeOf<
      'active' | 'partially_paid' | 'paid' | 'overpaid' | 'expired' | 'expired_partial' | 'cancelled'
    >();
    expectTypeOf<PspCheckoutErrorCode>().toEqualTypeOf<'link_invalid' | 'link_expired' | 'not_found' | 'unavailable'>();
  });

  it('the event union narrows by type', () => {
    expectTypeOf<PspCheckoutEvent['type']>().toEqualTypeOf<'ready' | 'status' | 'resize' | 'error'>();
    expectTypeOf<Extract<PspCheckoutEvent, { type: 'ready' }>>().toEqualTypeOf<PspCheckoutReadyEvent>();
    expectTypeOf<PspCheckoutReadyEvent>().toEqualTypeOf<{
      type: 'ready';
      status: InvoiceStatus;
      invoiceId: string;
      linkExpiresAt: string;
    }>();
    expectTypeOf<PspCheckoutStatusEvent>().toEqualTypeOf<{
      type: 'status';
      status: InvoiceStatus;
      invoiceId: string;
      paidAt: string | null;
    }>();
    expectTypeOf<PspCheckoutResizeEvent>().toEqualTypeOf<{ type: 'resize'; height: number }>();
    expectTypeOf<PspCheckoutErrorEvent>().toEqualTypeOf<{ type: 'error'; code: PspCheckoutErrorCode }>();
    expectTypeOf<PspCheckoutStatusSource>().toEqualTypeOf<PspCheckoutReadyEvent | PspCheckoutStatusEvent>();

    const describeEvent = (event: PspCheckoutEvent): string => {
      switch (event.type) {
        case 'ready':
          return event.linkExpiresAt;
        case 'status':
          return event.paidAt ?? event.status;
        case 'resize':
          return String(event.height);
        case 'error':
          return event.code;
      }
    };
    expectTypeOf(describeEvent).returns.toBeString();
  });

  it('props: url is required, callbacks are typed', () => {
    expectTypeOf(PspCheckout).returns.toEqualTypeOf<ReactElement | null>();
    expectTypeOf<ComponentProps<typeof PspCheckout>>().toEqualTypeOf<PspCheckoutProps>();
    expectTypeOf<PspCheckoutProps['url']>().toEqualTypeOf<string>();
    expectTypeOf<PspCheckoutProps>().toHaveProperty('minHeight').toEqualTypeOf<number | undefined>();
    expectTypeOf<NonNullable<PspCheckoutProps['onStatusChange']>>().parameters.toEqualTypeOf<
      [InvoiceStatus, PspCheckoutStatusSource]
    >();
    expectTypeOf<NonNullable<PspCheckoutProps['onPaid']>>().parameters.toEqualTypeOf<[PspCheckoutStatusSource]>();
    expectTypeOf<NonNullable<PspCheckoutProps['onReady']>>().parameters.toEqualTypeOf<[PspCheckoutReadyEvent]>();
    expectTypeOf<NonNullable<PspCheckoutProps['onError']>>().parameters.toEqualTypeOf<
      [PspCheckoutErrorCode, PspCheckoutErrorEvent | undefined]
    >();

    // A handler may take fewer parameters, and the url alone is enough
    const props: PspCheckoutProps = {
      url: 'https://pay.psp.example/#t',
      onError: (code) => {
        expectTypeOf(code).toEqualTypeOf<PspCheckoutErrorCode>();
      },
    };
    expectTypeOf(props).toExtend<PspCheckoutProps>();
    // @ts-expect-error url is required
    const noUrl: PspCheckoutProps = { onPaid: () => undefined };
    // @ts-expect-error a status is not a number
    const wrongStatus: PspCheckoutProps = { url: 'u', onStatusChange: (status: number) => status };
    expectTypeOf([noUrl, wrongStatus]).toBeArray();
  });

  it('mountPspCheckout takes the same callbacks', () => {
    expectTypeOf(mountPspCheckout).parameters.toEqualTypeOf<[Element, MountPspCheckoutOptions]>();
    expectTypeOf(mountPspCheckout).returns.toEqualTypeOf<PspCheckoutInstance>();
    expectTypeOf<PspCheckoutInstance['iframe']>().toEqualTypeOf<HTMLIFrameElement | null>();
    expectTypeOf<MountPspCheckoutOptions['onPaid']>().toEqualTypeOf<PspCheckoutProps['onPaid']>();
  });
});
