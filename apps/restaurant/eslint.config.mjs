import { createConfig } from '@quickbite/config/eslint';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  react: true,
  ignores: ['expo-env.d.ts', '.expo/**', 'dist/**'],
});
