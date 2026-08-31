import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Правило про баги, а не про стиль: приходит из пресета Next как `warn`,
      // то есть проходило бы гейт зелёным даже до `--max-warnings 0` (G238).
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // Миграции генерирует `payload migrate:create`, руками их не правим: сигнатура
    // `up({ payload, req })` приходит из генератора, и переименование аргументов
    // потерялось бы при следующей генерации. Гасим только это правило и только здесь,
    // чтобы `--max-warnings 0` не упирался в чужой код.
    files: ['src/migrations/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: ['.next/'],
  },
]

export default eslintConfig
