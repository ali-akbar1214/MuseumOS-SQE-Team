import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/exhibits/exhibit-workflow.ts',
        'src/auth/guards/permission.guard.ts',
      ],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
