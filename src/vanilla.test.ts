import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_ID, URL_1, message, onFrameSrc, postFrom, ready, resize, spies, status } from '../test/helpers';
import { mountPspCheckout } from './vanilla';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function setup(options: Partial<Parameters<typeof mountPspCheckout>[1]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = spies();
  const checkout = mountPspCheckout(container, { url: URL_1, ...handlers, ...options });
  return { container, handlers, checkout };
}

describe('mountPspCheckout', () => {
  it('appends the iframe with the same attributes as the component', () => {
    const { container, checkout } = setup({ title: 'Оплата', className: 'checkout', minHeight: 520 });
    const iframe = checkout.iframe!;
    expect(container.firstElementChild).toBe(iframe);
    expect(iframe.getAttribute('src')).toBe(URL_1);
    expect(iframe.title).toBe('Оплата');
    expect(iframe.className).toBe('checkout');
    expect(iframe.getAttribute('allow')).toBe('clipboard-write');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('eager');
    expect(iframe.hasAttribute('sandbox')).toBe(false);
    expect(iframe.style.width).toBe('100%');
    expect(iframe.style.height).toBe('520px');
  });

  it('reports the events like the component', () => {
    const { checkout, handlers } = setup();
    const iframe = checkout.iframe!;
    postFrom(iframe, ready('active'));
    postFrom(iframe, status('paid', '2026-09-29T12:05:03.000Z'));
    postFrom(iframe, status('overpaid', '2026-09-29T12:05:03.000Z'));
    postFrom(iframe, message('error', { code: 'unavailable' }));
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onStatusChange.mock.calls.map(([value]) => value)).toEqual(['active', 'paid', 'overpaid']);
    expect(handlers.onPaid).toHaveBeenCalledExactlyOnceWith({
      type: 'status',
      status: 'paid',
      invoiceId: INVOICE_ID,
      paidAt: '2026-09-29T12:05:03.000Z',
    });
    expect(handlers.onError).toHaveBeenCalledExactlyOnceWith('unavailable', { type: 'error', code: 'unavailable' });
    postFrom(iframe, status('expired'));
    expect(handlers.onExpired).toHaveBeenCalledTimes(1);
  });

  it('sets the height by resize, clamped', () => {
    const { checkout } = setup();
    const iframe = checkout.iframe!;
    postFrom(iframe, resize(700.1));
    expect(iframe.style.height).toBe('701px');
    postFrom(iframe, resize(99_999));
    expect(iframe.style.height).toBe('4000px');
  });

  it('ignores another origin and another window', () => {
    const { checkout, handlers } = setup();
    postFrom(checkout.iframe, ready(), { origin: 'https://evil.example' });
    postFrom(checkout.iframe, ready(), { source: window });
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('destroy() removes the iframe and stops listening, twice is fine', () => {
    const { container, checkout, handlers } = setup();
    const iframe = checkout.iframe!;
    const frameWindow = iframe.contentWindow;
    checkout.destroy();
    checkout.destroy();
    expect(container.childElementCount).toBe(0);
    postFrom(iframe, ready(), { source: frameWindow });
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('an invalid url appends nothing and reports link_invalid', () => {
    const { container, checkout, handlers } = setup({ url: 'https://evil.example/#t' });
    expect(checkout.iframe).toBeNull();
    expect(container.childElementCount).toBe(0);
    expect(handlers.onError).toHaveBeenCalledExactlyOnceWith('link_invalid', undefined);
    expect(() => {
      checkout.destroy();
    }).not.toThrow();
  });

  it('takes checkoutOrigin for your own stand', () => {
    const url = 'http://localhost:5180/#v1.a.b';
    const { checkout, handlers } = setup({ url, checkoutOrigin: 'http://localhost:5180' });
    postFrom(checkout.iframe, ready());
    postFrom(checkout.iframe, ready(), { origin: 'http://localhost:5180' });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(setup({ checkoutOrigin: 'http://localhost:5180' }).checkout.iframe).toBeNull();
  });

  it('listens before the page loads: a ready posted when src is set is handled', () => {
    onFrameSrc((iframe) => {
      expect(iframe.isConnected).toBe(true);
      postFrom(iframe, ready('paid'));
    });
    const { checkout, handlers } = setup();
    expect(checkout.iframe!.getAttribute('src')).toBe(URL_1);
    expect(handlers.onPaid).toHaveBeenCalledTimes(1);
  });

  it('throws on a missing container', () => {
    expect(() => mountPspCheckout(null as unknown as Element, { url: URL_1 })).toThrow(TypeError);
  });
});
