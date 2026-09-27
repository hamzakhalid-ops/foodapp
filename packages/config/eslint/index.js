// Shared ESLint flat configuration for QuickBite.
//
// Usage (eslint.config.js):
//   import { createConfig } from '@quickbite/config/eslint';
//   export default createConfig({ tsconfigRootDir: import.meta.dirname, react: true });

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir: string; react?: boolean; node?: boolean; ignores?: string[] }} options
 */
export function createConfig({ tsconfigRootDir, react = false, node = false, ignores = [] }) {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.next/**',
        '**/.expo/**',
        '**/generated/**',
        '**/*.config.js',
        '**/*.config.cjs',
        '**/*.config.mjs',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
        globals: {
          ...(node ? globals.node : {}),
          ...(react ? globals.browser : {}),
        },
      },
      rules: {
        // Type safety: `any` and unsafe casts require an explicit, documented exception.
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        '@typescript-eslint/ban-ts-comment': [
          'error',
          { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
        ],
        'no-console': 'error',
        eqeqeq: ['error', 'always'],
      },
    },
    ...(react
      ? [
          {
            plugins: { 'react-hooks': reactHooks },
            rules: {
              'react-hooks/rules-of-hooks': 'error',
              'react-hooks/exhaustive-deps': 'error',
            },
          },
        ]
      : []),
  );
}
