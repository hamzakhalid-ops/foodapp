import nextPlugin from '@next/eslint-plugin-next';
import { createConfig } from '@quickbite/config/eslint';

export default [
  ...createConfig({
    tsconfigRootDir: import.meta.dirname,
    react: true,
    ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  }),
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
