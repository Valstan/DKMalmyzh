// Вставка JSON-LD в страницу. Единственное место, где мы сознательно
// используем dangerouslySetInnerHTML: строку собирает `toJsonLdScript`, он же
// экранирует `<`/`>` (\u003c), поэтому закрыть тег изнутри данные не могут.
// Пересобирать JSON здесь заново нельзя — экранирование потеряется.

import { toJsonLdScript } from '../../../lib/jsonLd'

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(data) }} />
}
