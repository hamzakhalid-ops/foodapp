import { configure } from '@testing-library/react-native';

// findBy*/waitFor default to 1 s; a cold (uncached) run on a loaded machine can take longer to
// settle mutations and queries. Runs after the test framework is installed (setupFilesAfterEnv).
configure({ asyncUtilTimeout: 5000 });
