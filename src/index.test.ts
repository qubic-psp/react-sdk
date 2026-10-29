// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as vanilla from './vanilla';

describe('package entries', () => {
  it('VERSION equals the version of package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(main.VERSION).toBe(pkg.version);
    expect(vanilla.VERSION).toBe(pkg.version);
  });

  it('export only the documented values', () => {
    expect(Object.keys(main).sort()).toEqual(['PspCheckout', 'VERSION']);
    expect(Object.keys(vanilla).sort()).toEqual(['VERSION', 'mountPspCheckout']);
  });
});
