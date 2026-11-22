# Развертывание «Право Руля» в Yandex Cloud

Проект собирается как статическая SPA. Файлы интерфейса хранятся в Object Storage и раздаются через API Gateway. Серверная часть работает в Cloud Functions и использует YDB и Cloud Postbox.

## Архитектура

- Object Storage (`pravdarula.ru`) — статические файлы интерфейса.
- API Gateway (`pravdarula-production`) — единая HTTPS-точка входа для SPA и API.
- Cloud Functions (`pravdarula-api`) — авторизация, личные кабинеты, заказы, оплата и webhook.
- Managed YDB — пользователи, одноразовые коды, сессии, анкеты, заказы и покупки.
- Cloud Postbox (`auth.pravdarula.ru`) — одноразовые коды входа.
- Lockbox (`pravdarula-runtime-secrets`) — `AUTH_SECRET`.
- Lockbox (`pravdarula-yandex-pay`) — тестовый ключ `YANDEX_PAY_SANDBOX_API_KEY`; доступ выдан runtime service account.

Lovable используется как редактор исходного кода. Production не зависит от Lovable Cloud.

## Локальная сборка

```bash
npm run build:yandex
./yandex-api/build.sh
```

Статические файлы собираются в `.output/public`, архив Cloud Function — в `yandex-api/pravdarula-api.zip`.

## Секреты и платежи

`AUTH_SECRET` хранится в Lockbox и передается Cloud Function как переменная окружения.

Сейчас оставлен тестовый контур: `YANDEX_PAY_ENV=sandbox`, `YANDEX_PAY_MERCHANT_ID` задан, а `YANDEX_PAY_SANDBOX_API_KEY` хранится в Lockbox `pravdarula-yandex-pay`. В Sandbox ключ Merchant API совпадает с Merchant ID. Боевой ключ не нужен и не используется. Для будущего перехода в live потребуется отдельно выпустить боевой ключ и переключить `YANDEX_PAY_ENV=live`. Ключи нельзя помещать в браузерный код или build arguments.

## Деплой — одна команда

Lovable → GitHub (`main`) → Mac → Yandex Cloud. После завершения изменений в Lovable и синхронизации с GitHub выполнить:

```bash
cd ~/Desktop/pravdarula && ./deploy-yandex.sh
```

Никаких отдельных frontend/backend-команд, файлов совместимости, allowlist изменённых файлов или ручных подтверждений этапов не требуется. Скрипт автоматически:

1. Забирает свежий `main` из GitHub и устанавливает зависимости.
2. Запускает тесты проекта и релизные проверки.
3. Определяет изменения по графу импортов Yandex API: собирает SPA, Cloud Function и Gateway, когда они затронуты. Новые обычные файлы проекта приводят к полному релизу, а не к ручному согласованию списка путей.
4. Проверяет текущие Function/Gateway, неизменность Lockbox bindings и режим Яндекс Pay `sandbox`; получает короткоживущий IAM-токен для read-only проверки YDB.
5. Создаёт кандидата Cloud Function с настройками и секретами текущей версии, проверяет его health/auth, сохраняет резервную копию Object Storage и снимки Gateway/Function.
6. Применяет только поддерживаемые безопасные additive YDB-миграции, публикует статику и переключает Gateway на закреплённую версию API.
7. Проверяет хеши опубликованных файлов, production health и состояние signed-out auth. Только после успешных проверок обновляет локальный manifest последнего успешного релиза.

При ошибке после начала публикации скрипт в том же запуске автоматически восстанавливает предыдущую версию Cloud Function/Gateway и файлы сайта, затем проверяет восстановление. Если восстановление само не удаётся, `pending.json` сохраняется, чтобы следующий запуск не затёр незавершённый релиз.

**YDB:** автоматически применяются только миграции, которые migration engine распознаёт как один безопасный идемпотентный additive DDL statement с проверяемой схемой после применения. Удаление/изменение столбцов, многокомандные или иные неподдерживаемые миграции останавливают релиз до DDL. YDB не откатывается автоматически: additive-изменения сохраняются, поскольку удалять данные/схему ради отката кода небезопасно.

**Граница Lovable/Yandex:** код SPA и общие модули, импортируемые Yandex API, попадают в единый релиз. Новые TanStack server functions или API routes, которые не реализованы в `yandex-api/index.ts` и `yandex-api/api-gateway.yaml`, нельзя автоматически перенести в Cloud Functions; в таком случае скрипт остановится с понятной ошибкой, а не выпустит частично работающий сайт.

**Инфраструктура не меняется:** Object Storage, API Gateway, Cloud Functions, YDB, Postbox и Lockbox остаются существующими. `YANDEX_PAY_ENV=sandbox` и действующие секреты сохраняются. Preview mock-кабинет не включается в production build.

Нужны Bash, Git, Node.js 22+, npm, Bun, yc CLI, YDB CLI (`ydb`), curl и zip. Скрипт сам добавляет стандартные каталоги Bun, yc и ydb в `PATH`. Локальные IDs ресурсов хранятся в `.deploy-yandex.env`; секретные значения авторизации и оплаты остаются в Lockbox. Короткоживущий YDB IAM-токен создаётся во временном файле с правами `0600` и удаляется после запуска.

## Текущее состояние домена

- `https://pravdarula.ru` подключен к API Gateway через ANAME и действующий сертификат.
- Основной домен проверен напрямую, в обход VPN: HTML, JS, CSS, шрифты и API отвечают успешно; YDB подключена.
- Вход по email и личный кабинет имеют серверные маршруты; проверка Origin для `https://pravdarula.ru` настроена.
- `www.pravdarula.ru` сейчас отвечает редиректом 302 на `https://pravdarula.ru/`, но сам редирект пока обслуживается прежним провайдером. Чтобы обслуживать и `www` непосредственно через API Gateway, потребуется увеличить квоту Yandex Cloud с одного домена до двух.
- Платежи настроены на Sandbox; перед сквозным тестом нужно проверить, что тестовый Callback URL в кабинете Яндекс Пэй указывает на `https://pravdarula.ru` (Яндекс добавляет `/v1/webhook`). Боевой контур намеренно не включен.
