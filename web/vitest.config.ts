import { defineConfig } from 'vitest/config'

// Юнит-гейт: чистая логика без БД, браузера и Payload-рантайма. Стоит в CI до
// миграций — падать должно за секунды, а не после подъёма Postgres и сборки.
// Всё, что требует живой базы, проверяет сид (scripts/seed-ci.ts), а страницы в
// браузере — e2e; сюда такие тесты класть нельзя, иначе дешёвый шаг станет дорогим.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Даты форматируются через toLocaleDateString с локальной зоной: без
    // фиксированной TZ тест зеленел бы на раннере (UTC) и краснел в другом поясе.
    env: { TZ: 'Europe/Moscow' },
  },
})
