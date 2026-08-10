const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettier,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'coverage/*'],
  },
  {
    rules: {
      // The logger is the only place allowed to touch the console.
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/mocks/*', '**/mocks'],
              importNames: ['*'],
              message:
                'Screens and components must go through a repository (src/data), never mock data directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // Infrastructure that legitimately owns the console / mock wiring.
    files: [
      'src/logging/**',
      'src/data/**',
      'src/mocks/**',
      'src/test/**',
      'scripts/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
      // Some jest mocks (AsyncStorage's) are only published as CommonJS.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Build scripts run in Node, not in the React Native runtime.
    files: ['scripts/**'],
    languageOptions: {
      globals: { Buffer: 'readonly', process: 'readonly', console: 'readonly' },
    },
  },
];
