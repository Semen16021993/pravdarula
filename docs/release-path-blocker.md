# Архив: прежняя блокировка списка файлов

Этот документ описывает прежнюю версию release runner и больше не является инструкцией к деплою.

Раньше первая публикация требовала отдельный `release-path-review.json`, а изменения backend/Gateway — четыре ручных отчёта совместимости. Эти барьеры убраны из штатного сценария. Новые обычные файлы проекта автоматически переводят релиз в полный режим (SPA + API + Gateway).

Текущая команда одна:

```bash
cd ~/Desktop/pravdarula && ./deploy-yandex.sh
```

Не создавайте `RELEASE_PATH_REVIEW_FILE` или `RELEASE_COMPATIBILITY_FILE` и не добавляйте их в `.deploy-yandex.env`. Новые TanStack server functions/API routes, не реализованные в Yandex handler/Gateway, по-прежнему блокируются с объяснением: они не могут работать в production до реализации соответствующего Yandex API маршрута.
