import { FEED_PAGE_SIZE, getFeedPage } from '../../../lib/feed'
import { PostFeed } from '../components/PostFeed'

// Общая лента «Афиша и новости» — карточками с превью, по дате от новых к
// старым, по 20 штук с догрузкой по мере прокрутки (заказ владельца 30.09).
//
// Материалы всех домов культуры и общерайонные — вперемешку, одной лентой: на
// портале это «всё сразу», разбирать по домам — работа адресата `/dk`.
export async function NewsView() {
  const feed = await getFeedPage({ limit: FEED_PAGE_SIZE })

  return (
    <section>
      <h1>Новости</h1>
      {feed.docs.length === 0 ? (
        <p className="muted">Пока нет новостей.</p>
      ) : (
        <PostFeed
          initial={feed.docs}
          page={feed.page}
          totalPages={feed.totalPages}
          showCategory
          headingLevel="h2"
        />
      )}
    </section>
  )
}
