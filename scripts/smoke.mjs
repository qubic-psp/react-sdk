// yarn smoke — packs the package (npm pack runs the build) and, for every React major of SMOKE_REACT (default
// "18 19"), installs the tarball with that react, react-dom and @types/react into a temp project, without install
// scripts. SMOKE_TARBALL=<path> checks an already packed tarball instead (the release packs first). There it runs
// test/smoke/consumer.{mjs,cjs} with import() and require() — a server render, a client render in jsdom with
// messages of the page, mountPspCheckout() — and type-checks test/smoke/consumer.tsx against the installed
// declarations without skipLibCheck (moduleResolution bundler and node16). Needs the npm registry for React.
// Extra Node.js binaries to try:
//   SMOKE_NODES="$HOME/.nvm/versions/node/v20.10.0/bin/node $HOME/.nvm/versions/node/v24.9.0/bin/node" yarn smoke
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const tsc = require.resolve('typescript/bin/tsc');
const dir = mkdtempSync(join(tmpdir(), 'psp-react-smoke-'));
const nodes = [process.execPath, ...(process.env.SMOKE_NODES ?? '').split(/\s+/).filter(Boolean)];
const reacts = (process.env.SMOKE_REACT ?? '18 19').split(/\s+/).filter(Boolean);
const run = (cmd, args, cwd, env) =>
  execFileSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

const tsconfig = (module, moduleResolution) => ({
  compilerOptions: {
    strict: true,
    jsx: 'react-jsx',
    target: 'ES2020',
    lib: ['ES2020', 'DOM'],
    module,
    moduleResolution,
    types: [],
    skipLibCheck: false,
    noEmit: true,
  },
  files: ['consumer.tsx'],
});

try {
  const tarball = process.env.SMOKE_TARBALL
    ? resolve(process.env.SMOKE_TARBALL)
    : join(dir, run('npm', ['pack', '--silent', '--pack-destination', dir], root).trim().split('\n').pop());
  for (const major of reacts) {
    const project = join(dir, `react-${major}`);
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
    run(
      'npm',
      [
        'install',
        '--silent',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        // React and its typings come from the registry without a lockfile: their scripts never run
        '--ignore-scripts',
        tarball,
        `react@${major}`,
        `react-dom@${major}`,
        `@types/react@${major}`,
      ],
      project,
    );
    for (const file of ['consumer.mjs', 'consumer.cjs', 'consumer.tsx']) {
      copyFileSync(join(root, 'test/smoke', file), join(project, file));
    }
    writeFileSync(join(project, 'tsconfig.bundler.json'), JSON.stringify(tsconfig('ESNext', 'Bundler')));
    writeFileSync(join(project, 'tsconfig.node16.json'), JSON.stringify(tsconfig('Node16', 'Node16')));
    for (const config of ['tsconfig.bundler.json', 'tsconfig.node16.json']) {
      run(process.execPath, [tsc, '-p', config], project);
    }
    console.log(`types ok — React ${major}, @types/react ${major}, bundler and node16`);
    for (const node of nodes) {
      const env = { SMOKE_ROOT: root };
      process.stdout.write(run(node, ['consumer.mjs'], project, env));
      process.stdout.write(run(node, ['consumer.cjs'], project, env));
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
