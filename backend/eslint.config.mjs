import { createConfig } from '@quickbite/config/eslint';

export default [
  ...createConfig({
    tsconfigRootDir: import.meta.dirname,
    node: true,
    ignores: ['src/generated/**', 'prisma.config.ts'],
  }),
  {
    // NestJS relies on decorator metadata and empty module classes.
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
