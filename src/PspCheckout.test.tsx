import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_ID, ORIGIN, URL_1, URL_2, message, postFrom, ready, resize, spies, status } from '../test/helpers';
import { PspCheckout, type PspCheckoutProps } from './PspCheckout';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(props: Partial<PspCheckoutProps> = {}) {
  const handlers = spies();
  const view = render(<PspCheckout url={URL_1} {...handlers} {...props} />);
  const frame = () => view.container.querySelector('iframe');
  const post = (data: unknown, init?: Parameters<typeof postFrom>[2]) => {
    act(() => {
      postFrom(frame(), data, init);
    });
  };
  return { ...view, handlers, frame, post };
}

describe('<PspCheckout> iframe', () => {
  it('renders the payment page with the documented attributes', () => {
    const { frame } = mount();
    const iframe = frame()!;
    expect(iframe.getAttribute('src')).toBe(URL_1);
    expect(iframe.getAttribute('title')).toBe('Payment');
    expect(iframe.getAttribute('allow')).toBe('clipboard-write');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('eager');
    expect(iframe.hasAttribute('sandbox')).toBe(false);
    expect(iframe.style.width).toBe('100%');
    expect(iframe.style.height).toBe('480px');
    expect(iframe.style.display).toBe('block');
    expect(iframe.style.borderWidth || iframe.style.border).toMatch(/^0(px)?/);
  });

  it('takes title, className, style and minHeight; the height stays with the component', () => {
    const { frame } = mount({
      title: 'Оплата заказа',
      className: 'checkout',
      style: { borderRadius: 12, maxWidth: 480, width: '90%', height: 10 },
      minHeight: 600,
    });
    const iframe = frame()!;
    expect(iframe.title).toBe('Оплата заказа');
    expect(iframe.className).toBe('checkout');
    expect(iframe.style.borderRadius).toBe('12px');
    expect(iframe.style.maxWidth).toBe('480px');
    expect(iframe.style.width).toBe('90%');
    expect(iframe.style.height).toBe('600px');
  });

  it.each([
    [-5, '480px'],
    [Number.NaN, '480px'],
    [0, '0px'],
    [10_000, '4000px'],
  ])('minHeight %s gives %s', (minHeight, height) => {
    expect(mount({ minHeight }).frame()!.style.height).toBe(height);
  });
});

describe('<PspCheckout> events', () => {
  it('ready: onReady and the first status', () => {
    const { handlers, post } = mount();
    post({ ...ready('active'), address: 'TFAJNBx2ot7JKvBjgZCb8MisrjA6fuZ1tc' });
    const event = { type: 'ready', status: 'active', invoiceId: INVOICE_ID, linkExpiresAt: '2026-09-30T12:00:00.000Z' };
    expect(handlers.onReady).toHaveBeenCalledExactlyOnceWith(event);
    expect(handlers.onStatusChange).toHaveBeenCalledExactlyOnceWith('active', event);
    expect(handlers.onPaid).not.toHaveBeenCalled();
  });

  it('status: every change, not repeats', () => {
    const { handlers, post } = mount();
    post(ready('active'));
    post(status('active'));
    post(status('partially_paid'));
    expect(handlers.onStatusChange.mock.calls.map(([value]) => value)).toEqual(['active', 'partially_paid']);
    expect(handlers.onStatusChange).toHaveBeenLastCalledWith('partially_paid', {
      type: 'status',
      status: 'partially_paid',
      invoiceId: INVOICE_ID,
      paidAt: null,
    });
  });

  it('onPaid fires once for paid then overpaid', () => {
    const { handlers, post } = mount();
    post(ready('active'));
    post(status('paid', '2026-09-29T12:05:03.000Z'));
    post(status('overpaid', '2026-09-29T12:05:03.000Z'));
    post(status('paid', '2026-09-29T12:05:03.000Z'));
    expect(handlers.onPaid).toHaveBeenCalledExactlyOnceWith({
      type: 'status',
      status: 'paid',
      invoiceId: INVOICE_ID,
      paidAt: '2026-09-29T12:05:03.000Z',
    });
  });

  it('onPaid fires when the page opens on an overpaid invoice', () => {
    const { handlers, post } = mount();
    post(ready('overpaid'));
    expect(handlers.onPaid).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'ready' }));
  });

  it('onExpired fires once for expired and expired_partial', () => {
    const { handlers, post } = mount();
    post(ready('partially_paid'));
    post(status('expired_partial'));
    post(status('expired'));
    expect(handlers.onExpired).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'expired_partial' }));
  });

  it('resize sets the height, clamped to 4000 px', () => {
    const { frame, post } = mount();
    post(resize(712.3));
    expect(frame()!.style.height).toBe('713px');
    post(resize(250_000));
    expect(frame()!.style.height).toBe('4000px');
    for (const bad of [0, -1, Number.NaN, '900']) post(resize(bad));
    expect(frame()!.style.height).toBe('4000px');
  });

  it('error: onError with the code and the event, each time', () => {
    const { handlers, post } = mount();
    for (const code of ['link_invalid', 'link_expired', 'not_found', 'unavailable', 'unavailable']) {
      post(message('error', { code }));
    }
    expect(handlers.onError.mock.calls.map(([code]) => code)).toEqual([
      'link_invalid',
      'link_expired',
      'not_found',
      'unavailable',
      'unavailable',
    ]);
    expect(handlers.onError).toHaveBeenLastCalledWith('unavailable', { type: 'error', code: 'unavailable' });
  });

  it('a throwing callback does not stop onPaid', () => {
    const timers = vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as never);
    const { handlers, post } = mount({
      onStatusChange: () => {
        throw new Error('merchant bug');
      },
    });
    post(ready('paid'));
    expect(handlers.onPaid).toHaveBeenCalledTimes(1);
    expect(timers).toHaveBeenCalledTimes(1);
  });
});

describe('<PspCheckout> accepts only its own frame', () => {
  it('ignores another origin', () => {
    const { handlers, post } = mount();
    for (const origin of [
      'https://evil.example',
      'http://pay.psp.example',
      'https://pay.psp.example:444',
      'null',
      '',
    ]) {
      post(ready('paid'), { origin });
    }
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(handlers.onPaid).not.toHaveBeenCalled();
  });

  it('ignores another window, even with the right origin', () => {
    const { handlers, frame, post } = mount();
    const other = document.createElement('iframe');
    document.body.appendChild(other);
    try {
      post(ready('paid'), { source: other.contentWindow });
      post(ready('paid'), { source: window });
      post(ready('paid'), { source: null });
      expect(handlers.onReady).not.toHaveBeenCalled();
      post(ready('paid'), { source: frame()!.contentWindow });
      expect(handlers.onReady).toHaveBeenCalledTimes(1);
    } finally {
      other.remove();
    }
  });

  it('ignores messages that are not of the protocol', () => {
    const { handlers, frame, post } = mount();
    for (const data of [
      null,
      'ready',
      { ...ready(), source: 'other' },
      { ...ready(), v: 2 },
      message('navigate', { url: 'https://evil.example' }),
      { ...ready(), status: 'refunded' },
      message('error', { code: 'boom' }),
    ]) {
      post(data);
    }
    expect(Object.values(handlers).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(frame()!.style.height).toBe('480px');
  });

  it('stops listening on unmount', () => {
    const { handlers, frame, unmount } = mount();
    const iframe = frame()!;
    unmount();
    postFrom(iframe, ready('paid'));
    expect(handlers.onReady).not.toHaveBeenCalled();
  });
});

describe('<PspCheckout> props over time', () => {
  it('new handler identities neither reload the iframe nor miss events', () => {
    const { frame, post, rerender } = mount();
    const before = frame();
    const onPaid = vi.fn();
    const old = vi.fn();
    rerender(<PspCheckout url={URL_1} onPaid={old} />);
    rerender(<PspCheckout url={URL_1} onPaid={onPaid} />);
    expect(frame()).toBe(before);
    post(ready('paid'));
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });

  it('a new url loads a new iframe, resets the height and the once-only callbacks', () => {
    const { handlers, frame, post, rerender } = mount();
    const first = frame()!;
    const firstWindow = first.contentWindow!;
    post(resize(900));
    post(ready('paid'));
    expect(handlers.onPaid).toHaveBeenCalledTimes(1);

    rerender(<PspCheckout url={URL_2} {...handlers} />);
    const second = frame()!;
    expect(second).not.toBe(first);
    expect(second.getAttribute('src')).toBe(URL_2);
    expect(second.style.height).toBe('480px');

    // The removed frame is not heard any more; the new one is, from the start
    act(() => {
      postFrom(second, ready('active'), { source: firstWindow });
    });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    post(ready('paid'));
    expect(handlers.onReady).toHaveBeenCalledTimes(2);
    expect(handlers.onPaid).toHaveBeenCalledTimes(2);
  });

  it('works under StrictMode: one listener, one call per event', () => {
    const handlers = spies();
    const view = render(
      <StrictMode>
        <PspCheckout url={URL_1} {...handlers} />
      </StrictMode>,
    );
    act(() => {
      postFrom(view.container.querySelector('iframe'), ready('paid'));
    });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onStatusChange).toHaveBeenCalledTimes(1);
    expect(handlers.onPaid).toHaveBeenCalledTimes(1);
  });
});

describe('<PspCheckout> invalid url', () => {
  it.each([
    'http://pay.psp.example/#v1.a.b',
    'https://pay.psp.example/',
    'https://pay.psp.example/#',
    '/#v1.a.b',
    'javascript:alert(1)//#x',
    '',
  ])('%j renders nothing and reports link_invalid once', (url) => {
    const { container, handlers, rerender } = mount({ url });
    expect(container.innerHTML).toBe('');
    expect(handlers.onError).toHaveBeenCalledExactlyOnceWith('link_invalid', undefined);
    rerender(<PspCheckout url={url} {...handlers} />);
    expect(handlers.onError).toHaveBeenCalledTimes(1);
  });

  it('reports once under StrictMode, and again for the next invalid url', () => {
    const onError = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <PspCheckout url="https://pay.psp.example/" onError={onError} />
      </StrictMode>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    rerender(
      <StrictMode>
        <PspCheckout url="http://pay.psp.example/#t" onError={onError} />
      </StrictMode>,
    );
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('accepts http on localhost for development', () => {
    const { frame, handlers, post } = mount({ url: 'http://localhost:5180/#v1.a.b' });
    expect(frame()!.getAttribute('src')).toBe('http://localhost:5180/#v1.a.b');
    post(ready(), { origin: ORIGIN });
    post(ready(), { origin: 'http://localhost:5180' });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});

describe('<PspCheckout> server render and hydration', () => {
  it('hydrates the server markup without mismatches and then listens', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    container.innerHTML = renderToString(<PspCheckout url={URL_1} minHeight={520} />);
    document.body.appendChild(container);
    const serverFrame = container.querySelector('iframe');
    const onReady = vi.fn();
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(container, <PspCheckout url={URL_1} minHeight={520} onReady={onReady} />);
    });
    try {
      expect(container.querySelector('iframe')).toBe(serverFrame);
      expect(errors).not.toHaveBeenCalled();
      act(() => {
        postFrom(serverFrame, ready());
      });
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
