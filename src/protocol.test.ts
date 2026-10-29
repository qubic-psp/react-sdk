import { describe, expect, it, vi } from 'vitest';
import { INVOICE_ID, ORIGIN, URL_1, message, ready, resize, spies, status } from '../test/helpers';
import {
  DEFAULT_MIN_HEIGHT,
  MAX_HEIGHT,
  PSP_CHECKOUT_ORIGIN,
  clampHeight,
  createSession,
  initialHeight,
  invoke,
  linkOrigin,
  parseMessage,
} from './protocol';

describe('linkOrigin', () => {
  it('takes https://pay.psp.qubiq.cc by default', () => {
    expect(PSP_CHECKOUT_ORIGIN).toBe('https://pay.psp.qubiq.cc');
    expect(linkOrigin(URL_1)).toBe(ORIGIN);
    expect(linkOrigin('https://pay.psp.qubiq.cc/checkout/?a=1#t')).toBe(ORIGIN);
  });

  it.each([
    ['https://pay.psp.qubiq.cc:8443/#t', 'https://pay.psp.qubiq.cc:8443', 'https://pay.psp.qubiq.cc:8443'],
    ['https://pay.stage.example/#v1.a.b', 'https://pay.stage.example/', 'https://pay.stage.example'],
    ['https://PAY.stage.example/#t', 'https://pay.stage.example', 'https://pay.stage.example'],
    ['http://localhost:5180/#v1.a.b', 'http://localhost:5180', 'http://localhost:5180'],
    ['http://127.0.0.1:4800/#t', 'http://127.0.0.1:4800', 'http://127.0.0.1:4800'],
    ['http://[::1]:4800/#t', 'http://[::1]:4800', 'http://[::1]:4800'],
  ])('accepts %s for the origin %s', (url, expected, origin) => {
    expect(linkOrigin(url, expected)).toBe(origin);
  });

  it.each([
    ['another host', 'https://evil.example/#v1.a.b'],
    ['a look-alike host', 'https://pay.psp.qubiq.cc.evil.example/#t'],
    ['a subdomain', 'https://x.pay.psp.qubiq.cc/#t'],
    ['another port', 'https://pay.psp.qubiq.cc:444/#t'],
    ['plain http of the same host', 'http://pay.psp.qubiq.cc/#t'],
    ['a local page', 'http://localhost:5180/#t'],
  ])('refuses %s by default', (_name, url) => {
    expect(linkOrigin(url)).toBeNull();
  });

  it('refuses a platform link when another origin is expected', () => {
    expect(linkOrigin(URL_1, 'http://localhost:5180')).toBeNull();
  });

  it.each([
    ['no fragment', 'https://pay.psp.qubiq.cc/'],
    ['an empty fragment', 'https://pay.psp.qubiq.cc/#'],
    ['a relative url', '/#v1.a.b'],
    ['javascript:', 'javascript:alert(1)//#x'],
    ['data:', 'data:text/html,<p>x</p>#x'],
    ['a login', 'https://user@pay.psp.qubiq.cc/#t'],
    ['a password', 'https://user:pw@pay.psp.qubiq.cc/#t'],
    ['an empty string', ''],
    ['too long', `https://pay.psp.qubiq.cc/#${'a'.repeat(8192)}`],
    ['not a url', 'pay.psp.qubiq.cc/#t'],
  ])('refuses %s', (_name, url) => {
    expect(linkOrigin(url)).toBeNull();
  });

  it.each([undefined, null, 1, {}, ['https://pay.psp.qubiq.cc/#t']])('refuses a non-string url %j', (value) => {
    expect(linkOrigin(value)).toBeNull();
  });

  it.each([
    ['plain http outside localhost', 'http://pay.psp.qubiq.cc'],
    ['a path', 'https://pay.psp.qubiq.cc/pay'],
    ['a query', 'https://pay.psp.qubiq.cc/?x=1'],
    ['a fragment', 'https://pay.psp.qubiq.cc/#x'],
    ['a login', 'https://u@pay.psp.qubiq.cc'],
    ['no scheme', 'pay.psp.qubiq.cc'],
    ['an empty string', ''],
    ['null', null],
    ['a number', 1],
  ])('refuses an expected origin with %s', (_name, expected) => {
    expect(linkOrigin('https://pay.psp.qubiq.cc/#t', expected)).toBeNull();
  });
});

describe('parseMessage', () => {
  it('reads every type with its documented fields only', () => {
    expect(parseMessage({ ...ready('active'), extra: 1, address: 'T…' })).toEqual({
      type: 'ready',
      status: 'active',
      invoiceId: INVOICE_ID,
      linkExpiresAt: '2026-09-30T12:00:00.000Z',
    });
    expect(parseMessage(status('paid', '2026-09-29T12:05:03.000Z'))).toEqual({
      type: 'status',
      status: 'paid',
      invoiceId: INVOICE_ID,
      paidAt: '2026-09-29T12:05:03.000Z',
    });
    expect(parseMessage(resize(712.5))).toEqual({ type: 'resize', height: 712.5 });
    for (const code of ['link_invalid', 'link_expired', 'not_found', 'unavailable'] as const) {
      expect(parseMessage(message('error', { code }))).toEqual({ type: 'error', code });
    }
  });

  it('takes a missing paidAt of a status as null', () => {
    const { paidAt: _paidAt, ...rest } = status('active');
    expect(parseMessage(rest)).toMatchObject({ type: 'status', paidAt: null });
  });

  it.each([
    ['null', null],
    ['a string', '{"source":"psp-checkout","v":1,"type":"ready"}'],
    ['a number', 1],
    ['an array', [ready()]],
    ['another source', { ...ready(), source: 'other' }],
    ['no source', { ...ready(), source: undefined }],
    ['version 2', { ...ready(), v: 2 }],
    ['version as a string', { ...ready(), v: '1' }],
    ['an unknown type', message('navigate', { url: 'https://evil.example' })],
    ['an unknown status', ready('refunded' as never)],
    ['ready without invoiceId', { ...ready(), invoiceId: undefined }],
    ['ready with an empty invoiceId', { ...ready(), invoiceId: '' }],
    ['ready with a numeric linkExpiresAt', { ...ready(), linkExpiresAt: 1790683200 }],
    ['status with a numeric paidAt', { ...status('paid'), paidAt: 1790683200 }],
    ['status with an empty paidAt', { ...status('paid'), paidAt: '' }],
    ['status without a status', { ...status('paid'), status: undefined }],
    ['resize with a string', resize('700')],
    ['resize with 0', resize(0)],
    ['resize with a negative height', resize(-10)],
    ['resize with NaN', resize(Number.NaN)],
    ['resize with Infinity', resize(Number.POSITIVE_INFINITY)],
    ['an unknown error code', message('error', { code: 'boom' })],
    ['an error without code', message('error')],
  ])('ignores %s', (_name, data) => {
    expect(parseMessage(data)).toBeNull();
  });
});

describe('heights', () => {
  it('clamps a reported height to whole pixels up to the maximum', () => {
    expect(clampHeight(712.2)).toBe(713);
    expect(clampHeight(MAX_HEIGHT + 1)).toBe(MAX_HEIGHT);
    expect(clampHeight(1e9)).toBe(4000);
  });

  it('takes minHeight when it is a non-negative number', () => {
    expect(initialHeight(undefined)).toBe(DEFAULT_MIN_HEIGHT);
    expect(DEFAULT_MIN_HEIGHT).toBe(480);
    expect(initialHeight(600)).toBe(600);
    expect(initialHeight(0)).toBe(0);
    expect(initialHeight(9000)).toBe(MAX_HEIGHT);
    expect(initialHeight(-1)).toBe(DEFAULT_MIN_HEIGHT);
    expect(initialHeight(Number.NaN)).toBe(DEFAULT_MIN_HEIGHT);
    expect(initialHeight('600')).toBe(DEFAULT_MIN_HEIGHT);
  });
});

describe('createSession', () => {
  const setup = () => {
    const callbacks = spies();
    const setHeight = vi.fn();
    const handle = createSession(() => callbacks, setHeight);
    const send = (data: unknown) => {
      const event = parseMessage(data);
      if (event === null) throw new Error('invalid test message');
      handle(event);
    };
    return { callbacks, setHeight, send };
  };

  it('reports the first status with ready, then only changes', () => {
    const { callbacks, send } = setup();
    send(ready('active'));
    send(status('active'));
    send(status('partially_paid'));
    send(status('partially_paid'));
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onStatusChange.mock.calls.map(([value]) => value)).toEqual(['active', 'partially_paid']);
    expect(callbacks.onStatusChange.mock.calls[0]?.[1]).toMatchObject({ type: 'ready' });
    expect(callbacks.onStatusChange.mock.calls[1]?.[1]).toMatchObject({ type: 'status', paidAt: null });
  });

  it('calls onPaid once for paid and overpaid, also when the page opens on a paid invoice', () => {
    const { callbacks, send } = setup();
    send(ready('paid'));
    send(status('overpaid'));
    send(status('paid'));
    expect(callbacks.onPaid).toHaveBeenCalledTimes(1);
    expect(callbacks.onPaid).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready', status: 'paid' }));
    expect(callbacks.onStatusChange.mock.calls.map(([value]) => value)).toEqual(['paid', 'overpaid', 'paid']);
  });

  it('calls onExpired once for expired and expired_partial', () => {
    const { callbacks, send } = setup();
    send(ready('partially_paid'));
    send(status('expired_partial'));
    send(status('expired'));
    expect(callbacks.onExpired).toHaveBeenCalledTimes(1);
    expect(callbacks.onExpired).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired_partial' }));
    expect(callbacks.onPaid).not.toHaveBeenCalled();
  });

  it('calls neither for active and cancelled', () => {
    const { callbacks, send } = setup();
    send(ready('active'));
    send(status('cancelled'));
    expect(callbacks.onPaid).not.toHaveBeenCalled();
    expect(callbacks.onExpired).not.toHaveBeenCalled();
  });

  it('passes errors on every time and clamps resizes', () => {
    const { callbacks, setHeight, send } = setup();
    send(message('error', { code: 'unavailable' }));
    send(message('error', { code: 'unavailable' }));
    expect(callbacks.onError).toHaveBeenCalledTimes(2);
    expect(callbacks.onError).toHaveBeenCalledWith('unavailable', { type: 'error', code: 'unavailable' });
    send(resize(5000));
    send(resize(640.4));
    expect(setHeight.mock.calls).toEqual([[4000], [641]]);
  });
});

describe('invoke', () => {
  it('keeps going after a throwing callback and throws its error again from a timer', () => {
    vi.useFakeTimers();
    try {
      const error = new Error('merchant bug');
      const after = vi.fn();
      invoke(() => {
        throw error;
      });
      after();
      expect(after).toHaveBeenCalled();
      expect(() => vi.runAllTimers()).toThrow(error);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips an absent callback', () => {
    expect(() => {
      invoke(undefined);
    }).not.toThrow();
  });
});
