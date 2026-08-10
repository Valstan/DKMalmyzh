import Script from 'next/script'

/**
 * Яндекс.Метрика — единственный счётчик сайта (решение владельца 2026-08-09,
 * D-017). Грузится отложенно (`afterInteractive`), вне критического пути.
 *
 *   NEXT_PUBLIC_YANDEX_METRICA_ID — номер счётчика (только цифры)
 *
 * Переменная пуста или не число → не рендерится ничего. Так локальная разработка
 * и превью не пачкают статистику прода.
 *
 * ⚠️ NEXT_PUBLIC_* бейкаются в бандл ПРИ СБОРКЕ, а не читаются в рантайме:
 * значение задаётся `vars` репозитория и подхватывается шагом Build в
 * `deploy-prod.yml`. Смена значения требует пересборки, рестарта юнита мало.
 */
const METRICA_ID = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID

const metricaId = METRICA_ID && /^\d+$/.test(METRICA_ID) ? METRICA_ID : null

/** Включена ли аналитика — для строки об этом в политике конфиденциальности. */
export const analyticsEnabled = metricaId !== null

export function Analytics() {
  if (!metricaId) return null

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=${metricaId}","ym");
ym(${metricaId},"init",{ssr:true,webvisor:true,clickmap:true,accurateTrackBounce:true,trackLinks:true});`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${metricaId}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}
