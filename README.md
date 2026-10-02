# Feed-Pets

Лапки — семейный дневник ухода за собакой.

Семейный PWA-дневник ухода за собакой. Стек: Svelte 5, SvelteKit, TypeScript, Supabase и Three.js. Статическая версия публикуется на GitHub Pages.

Опубликованная версия: [konchampus.github.io/Feed-Pets](https://konchampus.github.io/Feed-Pets/).

## Запуск

Нужен Node.js 22 или новее.

```sh
npm install
npm run dev
```

Без настроек Supabase приложение работает локально: записи остаются в браузере, а для переноса их можно скачать в разделе «Настройки». `npm run check`, `npm run test:unit`, `npm run test:e2e` и `npm run build` проверяют типы, основные сценарии и сборку.

## Supabase

1. Создайте проект Supabase и выполните миграции `supabase/migrations/` по порядку через SQL Editor либо Supabase CLI.
2. Добавьте в GitHub → Settings → Secrets and variables → Actions следующие **secrets**: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_VAPID_KEY`. В клиент попадают только URL, anon key и публичный VAPID key. Таблицы защищены RLS.
3. Деплой через Actions доступен в публичном репозитории. В Settings → Pages выберите публикацию через GitHub Actions. Workflow собирает сайт с базовым путём `/<имя-репозитория>`.
4. В Supabase → Authentication → URL Configuration укажите URL вида `https://<пользователь>.github.io/<репозиторий>/` как Site URL и разрешённый redirect URL. Для email confirmation и восстановления пароля укажите Gmail SMTP в Authentication → SMTP Settings; создайте App Password и сохраните его только в панели Supabase. Не используйте основной пароль почты.
5. В Authentication → Providers включите Google OAuth. Client ID/secret создайте у Google и добавьте только в настройки Supabase. Redirect URI скопируйте из панели Supabase в настройки OAuth-клиента Google.
6. Для VK ID создайте OAuth2 custom provider `custom:vk-id` в Supabase: перенесите authorize/token/userinfo endpoints и callback URL из актуальной панели VK ID, разрешите PKCE и внесите client ID/secret только в Supabase. До завершения этой настройки кнопка VK ID не заработает.
7. Задайте Edge Function secrets через Supabase Dashboard → Edge Functions → Secrets или Supabase CLI:

   - `SUPABASE_SERVICE_ROLE_KEY` — service role из Settings → API Keys; только на сервере.
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — пара VAPID и контактный subject для Web Push. В GitHub хранится только публичный `PUBLIC_VAPID_KEY`.
   - `CRON_SECRET` — случайная длинная строка для защиты `send-reminders`.

   Сгенерируйте VAPID пару в терминале: `npx --yes web-push generate-vapid-keys --json`. Значение `publicKey` добавьте как GitHub Actions secret `PUBLIC_VAPID_KEY` и Supabase Edge secret `VAPID_PUBLIC_KEY`; `privateKey` — только как `VAPID_PRIVATE_KEY`. Задайте `VAPID_SUBJECT` как `mailto:<ваш адрес>` и создайте случайный длинный `CRON_SECRET`. Ключи не присылайте в чат.

   Service role, SMTP App Password, OAuth client secrets, `VAPID_PRIVATE_KEY` и `CRON_SECRET` нельзя класть в исходники, коммиты или GitHub variables. Никогда не используйте `service_role` в браузере.
8. Миграция включает `care_events` в публикацию `supabase_realtime`. Для расписания включите расширения `pg_cron` и `pg_net`, сохраните то же значение `CRON_SECRET` в Database → Vault под именем `CRON_SECRET` и выполните в SQL Editor, заменив `<project-ref>` на ref проекта:

   ```sql
   select cron.schedule(
     'lapki-send-reminders',
     '* * * * *',
     $job$
       select net.http_post(
         url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
         ),
         body := '{}'::jsonb
       );
     $job$
   );
   ```

   Расписание использует часовой пояс устройства. Не вставляйте секрет прямо в SQL или Git.

Web Push работает по модели повторной доставки: при сетевом сбое после отправки части семейных уведомлений устройство, уже получившее сообщение, может получить его повторно. Повтор использует ту же метку браузера.
9. После успешного Pages deploy проверьте URL приложения, регистрацию и подтверждение email, вход email/логин, сброс пароля, создание семьи, приглашение, данные двух семей, все типы отметок, Realtime и push.

Приглашение можно создать в «Настройки → Моя семья». Ссылка действует семь дней и принимается однократно. Если указать email, приглашение можно принять только из аккаунта с этим адресом; приложение не отправляет приглашение по почте автоматически.

## Web Push на iPhone

Для push на iPhone/iPad нужны iOS/iPadOS 16.4 или новее, HTTPS, добавление сайта на экран «Домой» из Safari и разрешение уведомлений после нажатия «Включить уведомления» внутри установленного PWA. **Работа push на iPhone не подтверждена** — это можно подтвердить только реальной проверкой установленного PWA на устройстве.

## Данные и ограничения

В локальном режиме записи хранятся в `localStorage` браузера; экспорт JSON можно восстановить в локальном режиме. В облачном режиме данные семьи и кэш разделены по семье и защищены RLS. Бесплатный Supabase может приостанавливать неактивный проект и не включает автоматические резервные копии; скачивайте резервную копию из «Настройки». Один аккаунт присоединяется к одной семье; для участия в другой семье нужен отдельный аккаунт.

Регистрация, login-by-username, приглашения, семейная синхронизация и отправка уведомлений требуют настроенного Supabase. Для email-подтверждения, Google/VK OAuth и push нужны учётные записи соответствующих сервисов. Сценарии с реальными аккаунтами, изоляция двух работающих семей и доставка push пока не проверялись на живом проекте.
