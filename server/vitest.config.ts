// server/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Игнорируем heavy-модули при импорте, чтобы тесты падали быстро
    deps: { inline: [] }
  }
})