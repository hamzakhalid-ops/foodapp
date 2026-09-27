import { createConfig } from '@quickbite/config/eslint';

export default createConfig({ tsconfigRootDir: import.meta.dirname, node: true });
