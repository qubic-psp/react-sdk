# План реализации react-sdk

npm-пакет `@qubiq/psp-react` — React-компонент `<PspCheckout url>` для фронтенда мерчанта: показывает страницу оплаты платформы (pay-ui, `pay.psp.qubiq.cc`) во фрейме и сообщает интерфейсу мерчанта о её событиях. Ссылку собирает сервер мерчанта: `psp.checkout.createUrl()` из `@qubiq/psp-sdk` (node-sdk). Каждая стадия заканчивается проверкой и коммитом в `dev`; этот файл обновляется вместе с ними.

Легенда: `[x]` — сделано, `[~]` — в работе, `[ ]` — не начато.

## Источники требований

- gateway [`docs/20-pay.md`](../../gateway/docs/20-pay.md): 20.1 — как устроен виджет, 20.2 — ссылка `https://pay…/#v1.<payload>.<signature>`, 20.8 — CSP страницы (`frame-ancestors https: http://localhost:* http://127.0.0.1:*`), 20.9 — сообщения `postMessage` странице мерчанта;
- статусы инвойса — node-sdk `src/types.ts` (`InvoiceStatus`), ссылка — node-sdk `src/checkout.ts` и README «Payment widget»;
- план виджета `~/.claude/plans/lively-riding-badger.md`, раздел 6 (одобрен владельцем 2026-10-28);
- упаковка, проверки и релиз — копия node-sdk (готовый пакет после аудита).

## Правила

- Рантайм без зависимостей, `react >= 18` — peer-зависимость. Сборка ESM + CJS для браузера (tsup, `platform: 'browser'`, ES2020).
- Всё строго типизировано, JSDoc и README — на английском, этот план — на русском.
- Тяжёлые прогоны — через `psp/.claude/heavy.sh react-sdk …`, vitest — не больше 2 воркеров.
- Без remote и push: репозиторий `qubic-psp/react-sdk` создаёт владелец. `main` = `dev`.

## Протокол (gateway 20.9) и как его читает пакет

| `type`   | Поля                                   | Что делает компонент                                                                                                                 |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ready`  | `status`, `invoiceId`, `linkExpiresAt` | `onReady`, затем статус как ниже                                                                                                     |
| `status` | `status`, `invoiceId`, `paidAt`        | `onStatusChange`, если статус новый; `onPaid` — один раз на `paid`/`overpaid`; `onExpired` — один раз на `expired`/`expired_partial` |
| `resize` | `height`                               | высота фрейма = `ceil(height)`, не больше 4000 px; `height ≤ 0`, не число — сообщение пропускается                                   |
| `error`  | `code`                                 | `onError(code, event)` на каждое сообщение (повторы `unavailable` возможны)                                                          |

Сообщение принимается, только если `event.origin` = origin из `url`, `event.source` = `contentWindow` своего фрейма (не `null`), `source: 'psp-checkout'`, `v: 1`, известный `type`, статус и код ошибки из списка, поля нужных типов. Лишние поля отбрасываются. `paidAt` без значения читается как `null`.

## Решения по ходу (на подтверждение владельцу)

| Вопрос                                | Решение                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Неверный `url`: исключение или ничего | Ничего не рисуется, `onError('link_invalid')` один раз на значение (и под StrictMode): исключение уронило бы страницу мерчанта без error boundary. Неверный — не `https:` (кроме `http:` на `localhost`, `127.0.0.1`, `[::1]`), логин/пароль в URL, пустой фрагмент. Формат токена проверяет сама страница                                                                             |
| `sandbox` у фрейма                    | Нет. Страница на чужом origin — её и так отделяет same-origin policy; рабочий sandbox должен разрешать скрипты, same-origin и попапы (ссылки на обозреватель), от него остаётся по сути запрет навигации родителя, а строгий ломает страницу. В README — вариант с `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` для тех, кому он обязателен |
| Первый статус                         | `onStatusChange` получает и статус из `ready` (первый известный), потом только изменения; одинаковый статус подряд не повторяется                                                                                                                                                                                                                                                      |
| Незнакомые статусы и коды ошибок      | Сообщение пропускается: протокол `v: 1` закрыт, новое значение — новая версия пакета                                                                                                                                                                                                                                                                                                   |
| Новая ссылка                          | `key={url}` у iframe: смена одного фрагмента `#` не перезагрузила бы страницу во фрейме, поэтому новый `url` — новый iframe, высота и однократные колбэки сбрасываются                                                                                                                                                                                                                 |
| Исключение в колбэке мерчанта         | Остальные колбэки сообщения всё равно вызываются, ошибка бросается заново из `setTimeout` (видна в консоли и трекерах ошибок)                                                                                                                                                                                                                                                          |
| Помощник без React                    | `mountPspCheckout(element, options)` — подпуть `@qubiq/psp-react/vanilla`, React не импортирует. Для старых резолверов без `exports` (TypeScript `node10`, webpack 4) — папка `vanilla/` с `package.json`; attw зелёный во всех режимах                                                                                                                                                |
| `'use client'`                        | Баннер tsup в обоих входах (компонент и помощник работают только в браузере). Rollup-проход `treeshake: true` выкидывает директиву, поэтому tree shaking — esbuild                                                                                                                                                                                                                     |

## Стадии

- [x] 0. Каркас по образцу node-sdk: package.json (`exports` ESM/CJS с `.d.ts`/`.d.cts`, `files`, `sideEffects: false`, `publishConfig`, `engines`, `peerDependencies: react >= 18`), tsconfig (strict + `noUncheckedIndexedAccess` и др., `jsx: react-jsx`, DOM, ES2020), tsup (`platform: 'browser'`, `external: react, react/jsx-runtime`), eslint (`strictTypeChecked` + `eslint-plugin-react-hooks` 7 `recommended-latest`, запрет Node-глобалов в `src`), prettier, vitest (`jsdom`, 2 воркера, typecheck), `.yarnrc` + lockfile-lint, `yarn ci`, LICENSE MIT
- [x] 1. Протокол без React (`src/protocol.ts`): `checkoutOrigin(url)`, `parseMessage(data)`, высоты (`clampHeight`, `initialHeight`), сессия загрузки (`createSession`: последний статус, однократные `onPaid`/`onExpired`), `invoke` (колбэк с изоляцией исключения), `listenToFrame` (проверка origin и source). Типы — `src/types.ts`. Тесты `src/protocol.test.ts`
- [x] 2. `<PspCheckout>` (`src/PspCheckout.tsx`): iframe с `allow="clipboard-write"`, `referrerPolicy="no-referrer"`, `loading="eager"`, стиль `display: block; width: 100%; border: 0` (переопределяется) и высота (не переопределяется); колбэки через ref (смена их идентичности не перерисовывает и не переподписывает); высота хранится вместе с `url`, для которого пришла. Тесты `src/PspCheckout.test.tsx` (атрибуты, все типы событий, однократность, ограничение высоты, чужой origin и чужое окно, мусорные сообщения, отписка при размонтировании, смена обработчиков и `url`, StrictMode, неверный `url`, localhost, гидрация серверной разметки без расхождений) и `src/ssr.test.tsx` (среда `node`: `renderToString` без `window`)
- [x] 3. `mountPspCheckout` (`src/vanilla.ts`): те же атрибуты, проверки и колбэки, `{ iframe, destroy }`, `TypeError` без контейнера. Тесты `src/vanilla.test.ts`
- [x] 4. Типы публичного API (`test/types/public-api.test-d.ts`): закрытые объединения статусов и кодов, сужение `PspCheckoutEvent` по `type`, параметры колбэков, обязательный `url`, сигнатура `mountPspCheckout`; входы пакета экспортируют только `PspCheckout`/`mountPspCheckout` и `VERSION` (`src/index.test.ts`)
- [x] 5. Пакет: `yarn package:check` — `publint --strict` и `attw --pack` чистые (node10, node16 CJS/ESM, bundler для `.` и `./vanilla`), tarball ≈ 14 кБ, 17 файлов; `yarn smoke` (`scripts/smoke.mjs`) — `npm pack`, для React 18 и 19 (`SMOKE_REACT`) установка tarball с `react`, `react-dom`, `@types/react` этой версии из npm во временный проект; там `test/smoke/consumer.{mjs,cjs}` через `import()` и `require()`: серверный рендер, клиентский рендер в jsdom с сообщениями (чужой origin, `ready` → `status` → `onPaid` один раз, ограничение высоты), `mountPspCheckout`; `test/smoke/consumer.tsx` проверяется `tsc` с `skipLibCheck: false` в режимах `bundler` и `node16`
- [x] 6. Документация: `README.md` на английском (как работает, установка, сервер — ссылка на `createUrl` SDK, компонент, таблица свойств, события, статусы, коды ошибок, высота, смена ссылки, безопасность, CSP сайта мерчанта `frame-src https://pay.psp.qubiq.cc`, Next.js и SSR, без React и простой `<iframe>`, локальная разработка, типы), `CHANGELOG.md`
- [x] 7. CI и релиз (`.github/workflows/`) — копия node-sdk: actions по SHA, `ci.yml` (`yarn ci` на Node 22 и матрица Node 18/20/22/24: `yarn test` + `yarn smoke`, установка с `--ignore-engines` — vite у vitest требует Node 20.19+), `release.yml` (тег `v*` на `main` = версия package.json; сборка без секретов → публикация в окружении `npm` с `--ignore-scripts`, `--provenance` у публичного репозитория). Проверится после создания репозитория
- [ ] 8. Шаги владельца по одному: репозиторий `qubic-psp/react-sdk` (origin `git@qubic-psp:qubic-psp/react-sdk.git`), push `main` и `dev` — CI; аудит security-auditor; живая проверка с pay-ui на testnet (виджет в merchant-test-ui); публикация 0.1.0 вместе с `@qubiq/psp-sdk` (организация `qubiq` на npm, секрет `NPM_TOKEN` окружения `npm`)

## Проверки

2026-10-29, локально:

- `yarn ci` на Node 22.20 зелёный: lockfile-lint, `tsc`, eslint, prettier, vitest, сборка, publint, attw, smoke;
- vitest — 6 файлов, 102 теста: `protocol` 56, `PspCheckout` 30, `vanilla` 7, `ssr` 3, `index` 2, типы 4; те же 102 — на Node 20.10 и 24.9;
- smoke — React 18.3.1 и 19.3.1 × Node 20.10, 22.20, 24.9 × ESM и CJS, типы `@types/react` 18 и 19 в режимах bundler и node16;
- проверка самих тестов: без проверки `event.source` или `event.origin` в `listenToFrame` падают по 3 теста.

Node 18 локально нет — проверит матрица CI. Смоуку на Node < 21 нужен `navigator` из jsdom: react-dom 18 читает его при загрузке.

## Коммиты стадий

| Стадия | Коммит    |
| ------ | --------- |
| 0      | `f6bfd87` |
| 1–4    | `286c60c` |
| 5      | `1a200bc` |
| 6–7    | `fc80882` |

## Найденные расхождения со спекой

Нет. Заметки для pay-ui (не расхождения): компонент ждёт `paidAt` в `status` (`null`, пока не оплачено; отсутствие поля тоже читается как `null`), повтор `status` с тем же статусом и повторные `error` безопасны; `resize` с высотой больше 4000 px обрезается.

## Как продолжить

Код, тесты, README, CI готовы (стадии 0–7). Осталась стадия 8 — шаги владельца. Локально `yarn ci` — на Node 22 из nvm (`PATH=$HOME/.nvm/versions/node/v22.20.0/bin:$PATH`), через `heavy.sh`; смоук на других версиях — `SMOKE_NODES="…/v20.10.0/bin/node …/v24.9.0/bin/node" yarn smoke`, одна версия React — `SMOKE_REACT=19 yarn smoke`. Смоук ставит React из реестра npm — нужна сеть.
