export default [{
  ignores: ['dist/**', 'node_modules/**', 'artifacts/**', 'test-results/**', 'playwright-report/**'],
}, {
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-constant-condition': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'no-unsafe-optional-chaining': 'error',
    'eqeqeq': 'error',
    'prefer-const': 'error',
  },
}];
