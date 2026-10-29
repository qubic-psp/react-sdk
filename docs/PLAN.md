# План реализации react-sdk

npm-пакет `@qubiq-psp/react` — React-компонент `<PspCheckout url>` для фронтенда мерчанта: показывает страницу оплаты платформы (pay-ui, `pay.psp.qubiq.cc`) во фрейме и сообщает интерфейсу мерчанта о её событиях. Ссылку собирает сервер мерчанта: `psp.checkout.createUrl()` из `@qubiq-psp/sdk` (node-sdk). Каждая стадия заканчивается проверкой и коммитом в `dev`; этот файл обновляется вместе с ними.

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

| Вопрос                                | Решение                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Неверный `url`: исключение или ничего | Ничего не рисуется, `onError('link_invalid')` один раз на пару `url` + `checkoutOrigin` (и под StrictMode): исключение уронило бы страницу мерчанта без error boundary. Неверный — другого origin, чем `checkoutOrigin`; не `https:` (кроме `http:` на `localhost`, `127.0.0.1`, `[::1]`); логин/пароль в URL; пустой фрагмент. Формат токена проверяет сама страница                               |
| Какой origin доверенный (RSDK-001)    | Не origin из `url`, а `checkoutOrigin`: по умолчанию `https://pay.psp.qubiq.cc` (`PSP_CHECKOUT_ORIGIN`), для своего стенда — origin из того же конфига, что `PSP_CHECKOUT_URL` SDK. `url` другого origin не рисуется, `event.origin` сравнивается с `checkoutOrigin`. Сам `checkoutOrigin` — по тем же правилам, путь только `/`                                                                    |
| Когда фрейм начинает грузиться        | Только после подписки на `message`: на сервере и в первом клиентском рендере у iframe нет `src` (гидрация совпадает), эффект подписывается и ставит `src` (повторный запуск StrictMode не перезагружает). Иначе страница, загруженная до гидрации, отправит единственный `ready` в пустоту, и `onPaid` для уже оплаченного инвойса не придёт. В `mountPspCheckout` — подписка, вставка, потом `src` |
| `sandbox` у фрейма                    | Нет. Страница на чужом origin — её и так отделяет same-origin policy; рабочий sandbox должен разрешать скрипты, same-origin и попапы (ссылки на обозреватель), от него остаётся по сути запрет навигации родителя, а строгий ломает страницу. В README — вариант с `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` для тех, кому он обязателен              |
| Первый статус                         | `onStatusChange` получает и статус из `ready` (первый известный), потом только изменения; одинаковый статус подряд не повторяется                                                                                                                                                                                                                                                                   |
| Незнакомые статусы и коды ошибок      | Сообщение пропускается: протокол `v: 1` закрыт, новое значение — новая версия пакета                                                                                                                                                                                                                                                                                                                |
| Новая ссылка                          | `key={url}` у iframe: смена одного фрагмента `#` не перезагрузила бы страницу во фрейме, поэтому новый `url` — новый iframe, высота и однократные колбэки сбрасываются                                                                                                                                                                                                                              |
| Исключение в колбэке мерчанта         | Остальные колбэки сообщения всё равно вызываются, ошибка бросается заново из `setTimeout` (видна в консоли и трекерах ошибок)                                                                                                                                                                                                                                                                       |
| Помощник без React                    | `mountPspCheckout(element, options)` — подпуть `@qubiq-psp/react/vanilla`, React не импортирует. Для старых резолверов без `exports` (TypeScript `node10`, webpack 4) — папка `vanilla/` с `package.json`; attw зелёный во всех режимах                                                                                                                                                             |
| `'use client'`                        | Баннер tsup в обоих входах (компонент и помощник работают только в браузере). Rollup-проход `treeshake: true` выкидывает директиву, поэтому tree shaking — esbuild                                                                                                                                                                                                                                  |

## Стадии

- [x] 0. Каркас по образцу node-sdk: package.json (`exports` ESM/CJS с `.d.ts`/`.d.cts`, `files`, `sideEffects: false`, `publishConfig`, `engines`, `peerDependencies: react >= 18`), tsconfig (strict + `noUncheckedIndexedAccess` и др., `jsx: react-jsx`, DOM, ES2020), tsup (`platform: 'browser'`, `external: react, react/jsx-runtime`), eslint (`strictTypeChecked` + `eslint-plugin-react-hooks` 7 `recommended-latest`, запрет Node-глобалов в `src`), prettier, vitest (`jsdom`, 2 воркера, typecheck), `.yarnrc` + lockfile-lint, `yarn ci`, LICENSE MIT
- [x] 1. Протокол без React (`src/protocol.ts`): `linkOrigin(url, checkoutOrigin)` (до аудита — `checkoutOrigin(url)`), `parseMessage(data)`, высоты (`clampHeight`, `initialHeight`), сессия загрузки (`createSession`: последний статус, однократные `onPaid`/`onExpired`), `invoke` (колбэк с изоляцией исключения), `listenToFrame` (проверка origin и source). Типы — `src/types.ts`. Тесты `src/protocol.test.ts`
- [x] 2. `<PspCheckout>` (`src/PspCheckout.tsx`): iframe с `allow="clipboard-write"`, `referrerPolicy="no-referrer"`, `loading="eager"`, стиль `display: block; width: 100%; border: 0` (переопределяется) и высота (не переопределяется); колбэки через ref (смена их идентичности не перерисовывает и не переподписывает); высота хранится вместе с `url`, для которого пришла. Тесты `src/PspCheckout.test.tsx` (атрибуты, все типы событий, однократность, ограничение высоты, чужой origin и чужое окно, мусорные сообщения, отписка при размонтировании, смена обработчиков и `url`, StrictMode, неверный `url`, localhost, гидрация серверной разметки без расхождений) и `src/ssr.test.tsx` (среда `node`: `renderToString` без `window`)
- [x] 3. `mountPspCheckout` (`src/vanilla.ts`): те же атрибуты, проверки и колбэки, `{ iframe, destroy }`, `TypeError` без контейнера. Тесты `src/vanilla.test.ts`
- [x] 4. Типы публичного API (`test/types/public-api.test-d.ts`): закрытые объединения статусов и кодов, сужение `PspCheckoutEvent` по `type`, параметры колбэков, обязательный `url`, сигнатура `mountPspCheckout`; входы пакета экспортируют только `PspCheckout`/`mountPspCheckout` и `VERSION` (`src/index.test.ts`)
- [x] 5. Пакет: `yarn package:check` — `publint --strict` и `attw --pack` чистые (node10, node16 CJS/ESM, bundler для `.` и `./vanilla`), tarball ≈ 14 кБ, 17 файлов; `yarn smoke` (`scripts/smoke.mjs`) — `npm pack`, для React 18 и 19 (`SMOKE_REACT`) установка tarball с `react`, `react-dom`, `@types/react` этой версии из npm во временный проект; там `test/smoke/consumer.{mjs,cjs}` через `import()` и `require()`: серверный рендер, клиентский рендер в jsdom с сообщениями (чужой origin, `ready` → `status` → `onPaid` один раз, ограничение высоты), `mountPspCheckout`; `test/smoke/consumer.tsx` проверяется `tsc` с `skipLibCheck: false` в режимах `bundler` и `node16`
- [x] 6. Документация: `README.md` на английском (как работает, установка, сервер — ссылка на `createUrl` SDK, компонент, таблица свойств, события, статусы, коды ошибок, высота, смена ссылки, безопасность, CSP сайта мерчанта `frame-src https://pay.psp.qubiq.cc`, Next.js и SSR, без React и простой `<iframe>`, локальная разработка, типы), `CHANGELOG.md`
- [x] 7. CI и релиз (`.github/workflows/`) — копия node-sdk: actions по SHA, `ci.yml` (`yarn ci` на Node 22 и матрица Node 18/20/22/24: `yarn smoke` на всех, `yarn test` — на 20+, установка с `--ignore-engines`: vitest 4 и vite 7 требуют Node 20), `release.yml` (тег `v*` на `main` = версия package.json; сборка без секретов: `yarn ci:release` → `npm pack` и SHA-256 → загрузка артефакта → смоук этого tarball → проверка хеша; публикация в окружении `npm` с `--ignore-scripts`, `--provenance` у публичного репозитория). Проверится после создания репозитория
- [x] 8. Аудит security-auditor (`DOCS/security/react-sdk.md`, 2026-10-29) — исправлено в коде, см. «Аудит безопасности»
- [x] 9. Шаги владельца: репозиторий `qubic-psp/react-sdk` (публичный), живая проверка с pay-ui на testnet (2026-10-29, оплата через виджет в merchant-test-ui), организация npm `qubiq-psp`; `@qubiq-psp/react` 0.1.0 опубликован 2026-10-29: тег `v0.1.0` → `release.yml` поставил версию в очередь npm (`npm stage publish`, provenance SLSA v1), владелец подтвердил её ключом 2FA на npmjs.com (Staged Packages). Первые два запуска до очереди не дошли: `npm pack` не создаёт папку `dist-pack`, затем `E422` provenance — в `package.json` не было `repository` (исправлено, тег переставлен). Проверено из реестра: `latest` = `0.1.0`, сопровождающие `qubiq_psp` и `illkap`, `npm audit signatures` — подписи и attestations, ESM и CJS импортируются

## Проверки

2026-10-29, локально:

- `yarn ci` на Node 22.20 зелёный: lockfile-lint, `tsc`, eslint, prettier, vitest, сборка, publint, attw, smoke;
- vitest — 6 файлов, 102 теста: `protocol` 56, `PspCheckout` 30, `vanilla` 7, `ssr` 3, `index` 2, типы 4; те же 102 — на Node 20.10 и 24.9;
- smoke — React 18.3.1 и 19.3.1 × Node 20.10, 22.20, 24.9 × ESM и CJS, типы `@types/react` 18 и 19 в режимах bundler и node16;
- проверка самих тестов: без проверки `event.source` или `event.origin` в `listenToFrame` падают по 3 теста.

2026-10-29, после аудита (vitest 4.1.12):

- `yarn ci` на Node 22.20 зелёный с чистого `dist`; vitest — 6 файлов, 128 тестов: `protocol` 72, `PspCheckout` 38, `vanilla` 9, `ssr` 3, `index` 2, типы 4; те же 128 — на Node 20.10 и 24.9;
- smoke — React 18.3.1 и 19.3.1 × Node 20.10, 22.20, 24.9 × ESM и CJS, типы bundler и node16; порядок релиза отрепетирован локально: `npm pack` → SHA-256 → `SMOKE_TARBALL=… yarn smoke` → хеш совпал;
- проверка самих тестов: если подписаться на `message` после установки `src` (в компоненте и в `mountPspCheckout`), падают 2 теста «ready в момент установки src»;
- `yarn audit` по devDependencies — 0 (было 2 critical, 3 moderate, 1 low).

Node 18 локально нет — проверит матрица CI (только смоук: vitest 4 требует Node 20). Смоуку на Node < 21 нужен `navigator` из jsdom: react-dom 18 читает его при загрузке.

## Коммиты стадий

| Стадия | Коммит               |
| ------ | -------------------- |
| 0      | `f6bfd87`            |
| 1–4    | `286c60c`            |
| 5      | `1a200bc`            |
| 6–7    | `fc80882`            |
| аудит  | `35174a4`, `0296d40` |

## Аудит безопасности

Отчёт security-auditor `DOCS/security/react-sdk.md` (2026-10-29, `dev` @ `5344857`): critical 0, high 0, medium 0, low 4.

| ID       | Severity | Что сделано                                                                                                                                                                                                                                                                                                                                                                                                                                           | Коммит    |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RSDK-001 | low      | Свойство `checkoutOrigin` у `<PspCheckout>` и опция у `mountPspCheckout`, по умолчанию `https://pay.psp.qubiq.cc` (экспорт `PSP_CHECKOUT_ORIGIN` из обоих входов). `url` другого origin не рисуется, `onError('link_invalid')` один раз; сообщения сверяются с `checkoutOrigin`, а не с origin из `url`. README: ссылка — только с вашего сервера, не из адресной строки, хранилищ и сообщений; `checkoutOrigin` для своего стенда и локальной pay-ui | `35174a4` |
| попутно  | —        | Гонка SSR: у iframe нет `src` на сервере и в первом клиентском рендере, `src` ставит эффект после подписки на `message`; в `mountPspCheckout` — подписка, вставка, `src`. Тесты: в SSR-разметке нет `src`, гидрация ставит `src` тому же элементу, `ready` в момент установки `src` обрабатывается, `src` ставится один раз и под StrictMode                                                                                                          | `35174a4` |
| попутно  | —        | README «Without React»: простой iframe обрабатывает и `ready`, и `status` (первый статус приходит в `ready`), сверяет origin с константой, ставит `src` после подписки                                                                                                                                                                                                                                                                                | `35174a4` |
| RSDK-002 | low      | `release.yml`: `yarn ci:release` (всё, кроме смоука) → `npm pack` и SHA-256 в выходах шага → загрузка артефакта → `SMOKE_TARBALL=<tarball> yarn smoke` → `sha256sum --check`. `smoke.mjs` ставит React с `--ignore-scripts` и умеет проверять готовый tarball. Публикуется ровно тот tarball, что собран до установки незакреплённых пакетов и проверен смоуком                                                                                       | `0296d40` |
| RSDK-003 | low      | `@qubiq` на npm оказался чужим (`alez00`): пакет переименован из `@qubiq/psp-react` в `@qubiq-psp/react`, организацию `qubiq-psp` с 2FA владелец создал 2026-10-29 — вместе с SDK-007                                                                                                                                                                                                                                                                 | —         |
| RSDK-004 | low      | vitest 3.2 → 4.1.12 (`tinypool` 2.1.2+, `@vitest/mocker`), esbuild 0.28.2 и vite 7.3 закреплены `resolutions` (tsup 8.5 просит esbuild ^0.27; tsup 9 требует Node 22.18+ и сломал бы сборку в матрице). `yarn audit` — 0. vitest 4 требует Node 20: в CI на Node 18 — только смоук, на 20+ — тесты и смоук; `minWorkers` из конфига убран (в vitest 4 его нет)                                                                                        | `0296d40` |

По ходу: `test/smoke/consumer.tsx` был в проекте TypeScript и через самоссылку пакета проверялся против локального `dist/` — на чистом checkout `yarn typecheck` упал бы. Файл исключён из `tsconfig.json` (его проверяет смоук против установленного tarball), eslint — без типов для `test/smoke/`.

Связано с node-sdk (не правилось, другой репозиторий): SDK-013 — у `checkoutUrl` нет умолчания и проверки хоста; ожидаемый origin в обоих пакетах должен совпадать (`https://pay.psp.qubiq.cc`).

## Найденные расхождения со спекой

Нет. Заметки для pay-ui (не расхождения): компонент ждёт `paidAt` в `status` (`null`, пока не оплачено; отсутствие поля тоже читается как `null`), повтор `status` с тем же статусом и повторные `error` безопасны; `resize` с высотой больше 4000 px обрезается.

## Как продолжить

Код, тесты, README, CI готовы (стадии 0–7), находки аудита исправлены (стадия 8). Осталась стадия 9 — шаги владельца. Локально `yarn ci` — на Node 22 из nvm (`PATH=$HOME/.nvm/versions/node/v22.20.0/bin:$PATH`), через `heavy.sh`; смоук на других версиях — `SMOKE_NODES="…/v20.10.0/bin/node …/v24.9.0/bin/node" yarn smoke`, одна версия React — `SMOKE_REACT=19 yarn smoke`. Смоук ставит React из реестра npm — нужна сеть.
