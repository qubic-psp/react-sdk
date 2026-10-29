# @qubiq/psp-react

React component for the PSP payment widget. It shows the platform's payment page in an `<iframe>` on your site and tells your interface what happens there: the invoice loaded, the status changed, the invoice is paid or expired.

- Your server builds the link with [`@qubiq/psp-sdk`](https://github.com/qubic-psp/node-sdk#payment-widget). This package only renders it and reports events.
- Messages are accepted only from the payment page origin and from this exact iframe. Every field is type-checked.
- The iframe height follows the page content, so the frame needs no scroll bar of its own.
- Works with React 18 and 19 and with server rendering (Next.js and other React frameworks).
- No runtime dependencies. ESM and CommonJS builds with TypeScript types.
- Not using React? See [`mountPspCheckout()`](#without-react) or a plain `<iframe>`.

> **Ship orders on webhooks only.** The callbacks are for your interface: show "thank you", hide the form. Browser events can be faked. Ship on the `invoice.paid` / `invoice.overpaid` webhook your server receives.

## Contents

- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Props](#props)
- [Events](#events)
- [Changing the link](#changing-the-link)
- [Security](#security)
- [Content Security Policy of your site](#content-security-policy-of-your-site)
- [Next.js and server rendering](#nextjs-and-server-rendering)
- [Without React](#without-react)
- [Local development](#local-development)
- [TypeScript](#typescript)

## How it works

```text
your server                       your page in the buyer's browser
  psp.checkout.createUrl(invoice)   <PspCheckout url={url} onPaid={…} />
  ── url ─────────────────────────►   │
                                      ▼
                                    <iframe src="https://pay.psp.qubiq.cc/#v1.<payload>.<signature>">
                                      │  the payment page: amount, QR code, address, countdown, live status
                                      │
  ◄── webhook invoice.paid ──────     └── postMessage: ready, status, resize, error ──► your callbacks
  (ship the order here)
```

1. Your server creates an invoice and builds a payment link with `@qubiq/psp-sdk`. The link carries a token after `#`, signed with your API secret. The secret itself is not in the link, and building a link makes no network call.
2. Your page renders `<PspCheckout url={url} />`. The buyer sees the amount, the network, a QR code and the address, and pays from their own wallet.
3. The page in the frame sends messages to your page. The component checks them and calls your callbacks.
4. The platform sends your server the `invoice.paid` (or `invoice.overpaid`) webhook. Ship the order there.

## Installation

```bash
npm install @qubiq/psp-react
# or: yarn add @qubiq/psp-react / pnpm add @qubiq/psp-react
```

Requires React 18 or newer (`react` is a peer dependency). The code targets ES2020 browsers.

## Quick start

**Server.** Build the link each time you render the order page: it is free, and the default lifetime is 24 hours. See [Payment widget](https://github.com/qubic-psp/node-sdk#payment-widget) in the `@qubiq/psp-sdk` README for branding, locale and lifetime options.

```ts
import { PspClient } from '@qubiq/psp-sdk';

const psp = new PspClient(); // PSP_API_KEY, PSP_API_SECRET, PSP_API_URL, PSP_CHECKOUT_URL from env

// the invoice you created for the order (psp.invoices.create), or just its id
const { url } = psp.checkout.createUrl(order.invoiceId, {
  branding: { companyName: 'My Shop', logoUrl: 'https://shop.example/logo.png', title: `Order #${order.id}` },
});
// send `url` to the page
```

**Page.**

```tsx
import { PspCheckout } from '@qubiq/psp-react';
import { useState } from 'react';

export function OrderPayment({ url }: { url: string }) {
  const [paid, setPaid] = useState(false);
  return (
    <>
      {paid && <p>Thank you! We will email you when the order ships.</p>}
      <PspCheckout
        url={url}
        onPaid={() => setPaid(true)}
        onExpired={() => refreshInvoice()}
        onError={(code) => console.warn('payment page:', code)}
      />
    </>
  );
}
```

## Props

| Prop             | Type                                                                  | Default     | What it is                                                                                                              |
| ---------------- | --------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `url`            | `string`                                                              | required    | The link from `psp.checkout.createUrl()`. A new value loads the page again, see [Changing the link](#changing-the-link) |
| `onReady`        | `(event: PspCheckoutReadyEvent) => void`                              |             | The page loaded the invoice (the first data)                                                                            |
| `onStatusChange` | `(status: InvoiceStatus, event: PspCheckoutStatusSource) => void`     |             | A new invoice status. The first one comes with `ready`, then every change                                               |
| `onPaid`         | `(event: PspCheckoutStatusSource) => void`                            |             | The invoice is `paid` or `overpaid`. **Once** per `url`                                                                 |
| `onExpired`      | `(event: PspCheckoutStatusSource) => void`                            |             | The invoice is `expired` or `expired_partial`. **Once** per `url`                                                       |
| `onError`        | `(code: PspCheckoutErrorCode, event?: PspCheckoutErrorEvent) => void` |             | The page cannot show the invoice, see [error codes](#error-codes)                                                       |
| `title`          | `string`                                                              | `"Payment"` | Accessible name of the iframe (`title` attribute)                                                                       |
| `minHeight`      | `number`                                                              | `480`       | Iframe height in px until the page reports its own height                                                               |
| `className`      | `string`                                                              |             | Class of the iframe                                                                                                     |
| `style`          | `CSSProperties`                                                       |             | Style of the iframe. `width: 100%`, `border: 0` and `display: block` can be overridden; `height` cannot                 |

The iframe is rendered as:

```html
<iframe
  src="{url}"
  title="Payment"
  allow="clipboard-write"
  referrerpolicy="no-referrer"
  loading="eager"
  style="display:block;width:100%;border:0;height:480px"
></iframe>
```

You can pass new callbacks on every render (inline arrow functions are fine): the component always calls the latest ones, and it neither reloads the iframe nor re-subscribes.

## Events

| Callback         | When                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onReady`        | The page received the invoice for the first time. `event.status`, `event.invoiceId`, `event.linkExpiresAt` (ISO 8601)                                                                        |
| `onStatusChange` | The status is new. Called with the status of `ready` first, then with each change (`event.type === 'status'`, `event.paidAt` is ISO 8601 or `null`). A repeated status is not reported again |
| `onPaid`         | The first time the status is `paid` or `overpaid` — also when the buyer opens the page of an invoice that is already paid                                                                    |
| `onExpired`      | The first time the status is `expired` or `expired_partial`                                                                                                                                  |
| `onError`        | The page reported an error, or the component refused `url` (`link_invalid`, without `event`). Can repeat: e.g. `unavailable` while the page retries                                          |

The order within one message is `onReady` → `onStatusChange` → `onPaid` / `onExpired`. If one of your callbacks throws, the others still run, and the error is re-thrown asynchronously so that it reaches the console and your error tracker.

### Statuses

| `status`          | Meaning                                                      | Final |
| ----------------- | ------------------------------------------------------------ | ----- |
| `active`          | Waiting for the payment                                      | no    |
| `partially_paid`  | Part of the amount received, the buyer can pay the rest      | no    |
| `paid`            | The amount received (`onPaid`)                               | yes   |
| `overpaid`        | More than the amount received (`onPaid`)                     | yes   |
| `expired`         | The payment window closed without payments (`onExpired`)     | yes   |
| `expired_partial` | The payment window closed with an underpayment (`onExpired`) | yes   |
| `cancelled`       | Cancelled by you or an admin                                 | yes   |

The page itself shows every status to the buyer, with the texts and network warnings of the platform. You do not have to.

### Error codes

| `code`         | What happened                                                                                 | What to do                                                  |
| -------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `link_invalid` | The link is broken or signed with a wrong or revoked key, or `url` is not a payment page link | Check how your server builds the link and which key it uses |
| `link_expired` | The link is past its expiry                                                                   | Build a new link on your server and pass it as `url`        |
| `not_found`    | No such invoice for the key of the link                                                       | Check the invoice id and the network of the key             |
| `unavailable`  | The platform is temporarily unavailable                                                       | Nothing: the page retries by itself                         |

The page shows its own message for each of them. The component renders nothing only for a `url` it refuses itself: not an absolute `https:` URL (`http:` is allowed on localhost), with a login or password, or without the token after `#`. It then calls `onError('link_invalid')` once for that value. Render the component once you have the link, not with an empty placeholder.

### Height

The page sends its content height whenever it changes, and the component sets the iframe height to it, up to 4000 px. Until the first message the height is `minHeight`. Give the iframe its width through the parent element or `style`.

## Changing the link

A new `url` mounts a new iframe and loads the page from the start (an iframe would not reload when only the part after `#` changes). The height goes back to `minHeight`, and `onPaid` / `onExpired` can fire again for the new link. Messages of the previous frame are ignored.

So keep `url` stable while the order page is open: build it on the server once per page view, not on every render. When `onError('link_expired')` arrives, fetch a fresh link from your server and pass it in.

## Security

- **Ship on webhooks only.** Anyone can post messages to your page or edit your page's JavaScript in their own browser. Treat `onPaid` as a hint for the interface. Your server learns about payments from the signed `invoice.paid` / `invoice.overpaid` webhook (see [Webhooks](https://github.com/qubic-psp/node-sdk#webhooks) of `@qubiq/psp-sdk`).
- **Origin and source checks are done for you.** A message is accepted only when `event.origin` equals the origin of `url` and `event.source` is the window of this iframe; then `source: 'psp-checkout'`, `v: 1`, the type and every field are checked. Anything else is ignored. Unknown fields are dropped. The messages carry no addresses or amounts.
- **The secret stays on your server.** The link holds only a signature. Nobody can change the invoice or the branding of a link without breaking it.
- **The token never reaches a server log.** It stands after `#`, which browsers do not send to servers or in `Referer`. The iframe also has `referrerpolicy="no-referrer"`, so the payment page does not learn the address of your order page.
- **No `sandbox`.** The payment page lives on another origin, so the browser's same-origin policy already keeps it away from your page, cookies and storage. A sandbox that keeps the page working must allow scripts, same-origin requests and popups (for the blockchain explorer links); what is left of it is mostly a ban on navigating your page, and a stricter one breaks the page. If your policy requires a sandbox anyway, use a plain iframe with at least `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`.
- **Permissions.** The frame gets only `clipboard-write`, for the "copy address" button. The page asks for nothing else.

## Content Security Policy of your site

If your site sends a `Content-Security-Policy` header, allow the payment page as a frame:

```text
Content-Security-Policy: …; frame-src https://pay.psp.qubiq.cc
```

Use the origin of the links your server builds (`checkoutUrl` / `PSP_CHECKOUT_URL` of `@qubiq/psp-sdk`). Without `frame-src`, `child-src` and then `default-src` apply. Nothing else is needed: the page loads its scripts, styles and data from its own origin, and it can be framed by any `https:` site, so there is no setup on the platform side either.

The component sets the iframe size through `style`. Styles React sets in the browser are not affected by CSP, but a `style-src` without `'unsafe-inline'` (or a `style-src-attr`) makes browsers drop the `style` attributes of server-rendered HTML. With such a policy, render the widget on the client only (in Next.js, `dynamic(() => import('./order-payment'), { ssr: false })` from a client component).

## Next.js and server rendering

The component is safe to render on the server: it touches no browser globals during render. The server HTML already contains the iframe, so the page starts loading before hydration; listening to messages starts after hydration. The package entries are marked `'use client'`.

In the App Router, build the link in a server component and pass it to a client component that holds the callbacks (functions cannot be passed from a server component):

```tsx
// app/orders/[id]/pay/page.tsx — server component
import { psp } from '@/lib/psp'; // new PspClient() — server-side only
import { OrderPayment } from './order-payment';

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  const { url } = psp.checkout.createUrl(order.invoiceId, { branding: { title: `Order #${order.number}` } });
  return <OrderPayment url={url} />;
}
```

```tsx
// app/orders/[id]/pay/order-payment.tsx
'use client';

import { PspCheckout } from '@qubiq/psp-react';
import { useRouter } from 'next/navigation';

export function OrderPayment({ url }: { url: string }) {
  const router = useRouter();
  return <PspCheckout url={url} onPaid={() => router.push('/thank-you')} onExpired={() => router.refresh()} />;
}
```

Without callbacks, a server component can render `<PspCheckout url={url} />` directly. Build the link per request, not into a statically generated or cached page: a cached page keeps serving the link after it expires. In the Pages Router, build the link in `getServerSideProps`.

## Without React

`@qubiq/psp-react/vanilla` has the same widget for any other frontend (Vue, Svelte, Angular, plain JavaScript). It does not import React.

```ts
import { mountPspCheckout } from '@qubiq/psp-react/vanilla';

const checkout = mountPspCheckout(document.getElementById('payment')!, {
  url,
  title: 'Payment',
  minHeight: 480,
  onStatusChange: (status) => console.log(status),
  onPaid: () => showThankYou(),
  onExpired: () => offerNewInvoice(),
  onError: (code) => console.warn(code),
});

// later, e.g. when leaving the page or before mounting a new link:
checkout.destroy();
```

`mountPspCheckout()` appends the iframe to the element and returns `{ iframe, destroy }`. The checks and callbacks are those of the component. For an invalid `url` it appends nothing, returns `iframe: null` and calls `onError('link_invalid')`.

A plain iframe works too. Then do the checks yourself:

```html
<iframe
  id="payment"
  src="{url}"
  title="Payment"
  allow="clipboard-write"
  referrerpolicy="no-referrer"
  style="display:block;width:100%;border:0;height:480px"
></iframe>
<script>
  const frame = document.getElementById('payment');
  const origin = new URL(frame.src).origin;
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    const m = event.data;
    if (!m || m.source !== 'psp-checkout' || m.v !== 1) return;
    if (m.type === 'resize' && typeof m.height === 'number') frame.style.height = Math.min(m.height, 4000) + 'px';
    if (m.type === 'status' && (m.status === 'paid' || m.status === 'overpaid')) showThankYou(); // the UI only
  });
</script>
```

The messages of the page:

| `type`   | Fields                                 | When                                                  |
| -------- | -------------------------------------- | ----------------------------------------------------- |
| `ready`  | `status`, `invoiceId`, `linkExpiresAt` | The first successful load of the invoice              |
| `status` | `status`, `invoiceId`, `paidAt`        | The invoice status changed                            |
| `resize` | `height` (px)                          | The content height changed                            |
| `error`  | `code`                                 | The link does not work or the platform is unavailable |

Each one looks like `{ "source": "psp-checkout", "v": 1, "type": "status", "status": "paid", … }`.

## Local development

Links of a payment page running on your machine are accepted over plain `http:` on `localhost`, `127.0.0.1` and `[::1]`. Everything else must be `https:`. The payment page lets itself be framed by `http://localhost:*` and `http://127.0.0.1:*`, so you can develop your shop locally against the testnet: build the link with a `psp_pk_test_…` key.

## TypeScript

The package is written in strict TypeScript. Exported types:

- `PspCheckoutProps`, `PspCheckoutCallbacks`;
- `PspCheckoutEvent` — the union of `PspCheckoutReadyEvent`, `PspCheckoutStatusEvent`, `PspCheckoutResizeEvent`, `PspCheckoutErrorEvent`, narrowed by `type`; `PspCheckoutStatusSource` — `ready` or `status`;
- `InvoiceStatus`, `PspCheckoutErrorCode`;
- from `@qubiq/psp-react/vanilla`: `MountPspCheckoutOptions`, `PspCheckoutInstance` and the same event types.

`InvoiceStatus` is the same union as in `@qubiq/psp-sdk`.

## Versioning

The package follows [Semantic Versioning](https://semver.org/). Changes are listed in [CHANGELOG.md](CHANGELOG.md). A new version of the message protocol (`v`) comes with a new major version of this package.

## License

[MIT](LICENSE)
