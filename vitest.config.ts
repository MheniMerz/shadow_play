import { defineConfig } from 'vitest/config';

// Tests are pure TypeScript (hand recognition); they do not need the IWSDK Vite plugin.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
