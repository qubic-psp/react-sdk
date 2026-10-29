import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      // () => resolve() and similar callbacks are the usual shorthand
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // The package never prints by itself: problems go to onError
      'no-console': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // The package runs in browsers: no Node.js globals in the shipped code
    files: ['src/**'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.test-d.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Browser code: no Node.js globals.' },
        { name: 'Buffer', message: 'Browser code: no Node.js globals.' },
        { name: 'global', message: 'Browser code: use globalThis.' },
      ],
    },
  },
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], extends: [tseslint.configs.disableTypeChecked] },
  // The CommonJS smoke consumer checks require() of the package on purpose
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts', 'test/**', 'scripts/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off', 'no-console': 'off' },
  },
);
