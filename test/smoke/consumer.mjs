// Runs inside a temp project that installed the packed tarball and a React version: `node consumer.mjs` (ESM)
// and, through consumer.cjs, the same checks with require(). jsdom comes from the devDependencies of the package
// (SMOKE_ROOT). Exits non-zero on the first failed check.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ORIGIN = 'https://pay.psp.example';
const URL = `${ORIGIN}/#v1.eyJrIjoicHNwX3BrX3Rlc3RfM0tkOUxtMlF4N1J0NVZiOE53MUhjNFpwIn0.${'a'.repeat(43)}`;
const message = (type, fields) => ({ source: 'psp-checkout', v: 1, type, ...fields });
const ready = (status) =>
  message('ready', {
    status,
    invoiceId: '97da92f5-45c0-411b-9ed5-6793b396cd5f',
    linkExpiresAt: '2026-09-30T12:00:00Z',
  });

export async function run(load, flavor) {
  const assert = (ok, what) => {
    if (!ok) throw new Error(`${flavor}: ${what}`);
  };
  const React = await load('react');
  const server = await load('react-dom/server');
  const { PspCheckout, VERSION } = await load('@qubiq/psp-react');
  const { mountPspCheckout } = await load('@qubiq/psp-react/vanilla');
  const h = React.createElement;

  // Server render: no window, the iframe is in the markup
  assert(typeof window === 'undefined', 'no window on the server');
  const html = server.renderToString(h(PspCheckout, { url: URL, minHeight: 500 }));
  assert(html.startsWith('<iframe') && html.includes(`src="${URL}"`) && html.includes('height:500px'), 'SSR markup');
  assert(server.renderToString(h(PspCheckout, { url: 'http://pay.psp.example/#t' })) === '', 'SSR of a bad url');

  // Browser: jsdom globals first, then react-dom/client
  const { JSDOM } = createRequire(join(process.env.SMOKE_ROOT, 'package.json'))('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://shop.example/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  // react-dom 18 reads navigator.userAgent on load; Node.js has a global navigator only since 21
  if (typeof navigator === 'undefined') globalThis.navigator = dom.window.navigator;
  const client = await load('react-dom/client');
  const post = (frame, data, origin = ORIGIN) =>
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin, source: frame.contentWindow }));

  const calls = [];
  const container = dom.window.document.getElementById('root');
  const root = client.createRoot(container);
  await React.act(async () => {
    root.render(
      h(PspCheckout, {
        url: URL,
        onReady: (e) => calls.push(`ready:${e.status}`),
        onStatusChange: (status) => calls.push(`status:${status}`),
        onPaid: () => calls.push('paid'),
        onError: (code) => calls.push(`error:${code}`),
      }),
    );
  });
  const iframe = container.querySelector('iframe');
  assert(iframe?.getAttribute('src') === URL && iframe.style.height === '480px', 'client render');
  await React.act(async () => {
    post(iframe, ready('paid'), 'https://evil.example');
    post(iframe, ready('active'));
    post(iframe, message('status', { status: 'paid', invoiceId: 'x', paidAt: '2026-09-29T12:05:03Z' }));
    post(iframe, message('status', { status: 'overpaid', invoiceId: 'x', paidAt: '2026-09-29T12:05:03Z' }));
    post(iframe, message('resize', { height: 9000 }));
  });
  const expected = 'ready:active,status:active,status:paid,paid,status:overpaid';
  assert(calls.join(',') === expected, `events: ${calls.join(',')}`);
  assert(iframe.style.height === '4000px', 'resize clamp');
  await React.act(async () => root.unmount());

  // Without React
  let paid = 0;
  const box = dom.window.document.body.appendChild(dom.window.document.createElement('div'));
  const widget = mountPspCheckout(box, { url: URL, onPaid: () => paid++ });
  post(widget.iframe, ready('paid'));
  widget.destroy();
  assert(paid === 1 && box.childElementCount === 0, 'mountPspCheckout');

  dom.window.close();
  console.log(`${flavor} ok — @qubiq/psp-react ${VERSION}, React ${React.version}, Node.js ${process.version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run((name) => import(name), 'esm');
}
