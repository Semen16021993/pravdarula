# Развертывание «Право Руля» в Yandex Cloud

Проект собирается как статическая SPA. Файлы интерфейса хранятся в Object Storage и раздаются через API Gateway. Серверная часть работает в Cloud Functions и использует YDB и Cloud Postbox.

## Архитектура

- Object Storage (`pravdarula.ru`) — статические файлы интерфейса.
- API Gateway (`pravdarula-production`) — единая HTTPS-точка входа для SPA и API.
- Cloud Functions (`pravdarula-api`) — авторизация, личные кабинеты, заказы, оплата и webhook.
- Managed YDB — пользователи, одноразовые коды, сессии, анкеты, заказы и покупки.
- Cloud Postbox (`auth.pravdarula.ru`) — одноразовые коды входа.
- Lockbox (`pravdarula-runtime-secrets`) — `AUTH_SECRET`.
- Lockbox (`pravdarula-yandex-pay`) — отдельный секрет для ключей Yandex Pay; сейчас он создан, но пуст.

Lovable используется как редактор исходного кода. Для работы сайта не требуется Lovable Cloud или Supabase.

## Локальная сборка

```bash
npm run build:yandex
./yandex-api/build.sh
```

Статические файлы собираются в `.output/public`, архив Cloud Function — в `yandex-api/pravdarula-api.zip`.

## Секреты и платежи

`AUTH_SECRET` хранится в Lockbox и передается Cloud Function как переменная окружения.

Для включения платежей нужно добавить в секрет `pravdarula-yandex-pay` ключи `YANDEX_PAY_API_KEY` (боевой) и/или `YANDEX_PAY_SANDBOX_API_KEY` (тестовый). Сейчас `YANDEX_PAY_ENV=sandbox`, но ключ не добавлен, поэтому создание платежей отвечает сообщением о временной недоступности оплаты. Ключ нельзя помещать в браузерный код или build arguments.

## Деплой

1. Один раз скопировать `.deploy-yandex.env.example` в локальный `.deploy-yandex.env` и заполнить параметры Yandex Cloud. Файл с реальными настройками игнорируется Git.
2. Для следующего обновления выполнить:

```bash
./deploy-yandex.sh
```

Скрипт собирает SPA и Cloud Function, загружает файлы в Object Storage, публикует новую версию Cloud Function, обновляет API Gateway и проверяет `APP_BASE_URL/api/health`.

## Текущее состояние домена

- `https://pravdarula.ru` подключен к API Gateway через ANAME и действующий сертификат.
- Основной домен проверен напрямую, в обход VPN: HTML, JS, CSS, шрифты и API отвечают успешно; YDB подключена.
- Вход по email и личный кабинет имеют серверные маршруты; проверка Origin для `https://pravdarula.ru` настроена.
- `www.pravdarula.ru` сейчас отвечает редиректом 302 на `https://pravdarula.ru/`, но сам редирект пока обслуживается прежним провайдером. Чтобы обслуживать и `www` непосредственно через API Gateway, потребуется увеличить квоту Yandex Cloud с одного домена до двух.
- Боевые платежи пока не включены: отсутствует ключ Yandex Pay.
