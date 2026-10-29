// @vitest-environment node
// The server render of React frameworks (Next.js, Remix, Astro): no window, no document, no effects.
import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { URL_1 } from '../test/helpers';
import { PspCheckout } from './index';

describe('server render', () => {
  it('runs without browser globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('renders the iframe without src', () => {
    const html = renderToString(
      <StrictMode>
        <PspCheckout url={URL_1} title="Payment for order 10530" minHeight={520} className="checkout" />
      </StrictMode>,
    );
    expect(html).toMatch(/^<iframe /);
    // No src: the page loads after hydration, when the component listens to it
    expect(html).not.toContain('src=');
    expect(html).not.toContain(URL_1);
    expect(html).toContain('title="Payment for order 10530"');
    expect(html).toContain('allow="clipboard-write"');
    expect(html).toMatch(/referrerPolicy="no-referrer"/i);
    expect(html).toContain('loading="eager"');
    expect(html).toContain('class="checkout"');
    expect(html).toContain('height:520px');
    expect(html).not.toContain('sandbox');
  });

  it('renders nothing for an invalid url and calls nothing', () => {
    const onError = vi.fn();
    expect(renderToStaticMarkup(<PspCheckout url="https://evil.example/#t" onError={onError} />)).toBe('');
    expect(onError).not.toHaveBeenCalled();
  });
});
