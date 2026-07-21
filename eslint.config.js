// Minimal flat ESLint config (ADR-0001: no build step/TS; ADR-0006: single root package).
// Kept dependency-free (no @eslint/js/globals packages) so `npm run lint` has no extra
// fetch surface beyond the `eslint` package itself.
export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'migrations/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off',
    },
  },
];
