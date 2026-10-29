import { defineConfig } from 'tsup';

// Two entries, two formats: dist/index.{js,cjs} (the React component) and dist/vanilla.{js,cjs} (no React), with
// .d.ts / .d.cts next to them. React is a peer dependency and is never bundled. The `vanilla/` folder of the
// package root points old resolvers (TypeScript `node10`, webpack 4) without `exports` support to the second entry.
//
// 'use client' marks both entries as client code for React Server Components (Next.js App Router): the component
// and the helper need a browser. The banner is the only way to keep the directive: esbuild drops it from the
// sources, and the extra Rollup pass of `treeshake: true` drops it from the output, so tree shaking is esbuild's own.
export default defineConfig({
  entry: { index: 'src/index.ts', vanilla: 'src/vanilla.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'browser',
  target: 'es2020',
  external: ['react', 'react/jsx-runtime'],
  banner: { js: "'use client';" },
  sourcemap: true,
  clean: true,
  splitting: false,
});
