# Feed-Pets

Лапки - семейный дневник ухода за собакой.

Семейный PWA-дневник ухода за собакой. Стек: Svelte 5, SvelteKit, TypeScript, Supabase и Three.js. Статическая версия публикуется на GitHub Pages.

Опубликованная версия: [konchampus.github.io/Feed-Pets](https://konchampus.github.io/Feed-Pets/).

## Запуск

Нужен Node.js 22.12+ из 22.x или Node.js 24.x.

```sh
cp .env.example .env
npm ci
npm run dev
```

В PowerShell вместо `cp` используйте `Copy-Item .env.example .env`. Для локального режима значения в `.env` можно оставить пустыми; семейные функции и push требуют настроек Supabase из раздела ниже.

Без настроек Supabase приложение работает как локальный дневник: первый запуск начинается без тестового профиля, добавьте свою собаку в настройках; записи остаются в браузере, а для переноса их можно скачать в разделе «Настройки». `npm run check`, `npm run test:unit`, `npm run test:e2e` и `npm run build` проверяют типы, основные сценарии и сборку.

## Supabase

1. Для Feed-Pets уже создан проект Supabase: project ref `vrbcpasdqrmuaejtyvpo`, Project URL `https://vrbcpasdqrmuaejtyvpo.supabase.co`. В Settings → API Keys возьмите default Publishable key (`sb_publishable_…`). Publishable key предназначен для браузера; доступ к данным ограничен RLS. Старый anon key пока тоже поддерживается, если проект уже использует его.
2. Установите [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started), войдите и привяжите проект. У live-проекта Feed-Pets восемь миграций уже применены через Supabase platform tools; **не запускайте на нём `supabase db push`, пока не сверите remote migration history с именами локальных файлов**. Сначала проверьте `supabase migration list --linked`; при расхождении остановитесь и согласуйте историю с фактически применённой схемой. Для нового пустого проекта из корня репозитория выполните:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   supabase functions deploy
   ```

   `project-ref` указан в URL проекта и в настройках Supabase. `db push` применяет миграции из `supabase/migrations/`. Если часть миграций уже запускали вручную через SQL Editor, сначала сверьте историю миграций с CLI, чтобы не применить их второй раз. Последняя команда отдельно публикует Edge Functions: Pages workflow проверяет их типы, но не развёртывает их. CLI хранит авторизацию локально; токены и service role не добавляйте в репозиторий.
3. Pages workflow уже использует Project URL и default Publishable key этого проекта как публичные build defaults. Это значение `sb_publishable_…` предназначено для браузера и не даёт обхода RLS; оно видно в собранном клиенте. При ротации ключа или смене проекта можно переопределить defaults через GitHub repo `konchampus/Feed-Pets` → Settings → Secrets and variables → Actions → New repository secret: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (старое имя `PUBLIC_SUPABASE_ANON_KEY` пока поддерживается как fallback). Для Push после настройки VAPID добавьте туда только публичный `PUBLIC_VAPID_KEY`. Не используйте `sb_secret_…` или `service_role` в клиенте.
4. В Settings → Pages выберите публикацию через GitHub Actions. Workflow собирает сайт с базовым путём `/<имя-репозитория>`.
5. В Supabase → Authentication → URL Configuration установите Site URL `https://konchampus.github.io/Feed-Pets/` и добавьте Redirect URLs `https://konchampus.github.io/Feed-Pets/`, `https://konchampus.github.io/Feed-Pets/**` и для локальной проверки `http://localhost:5173/**`. Redirect после входа должен совпасть с разрешённым URL ([документация Supabase](https://supabase.com/docs/guides/auth/redirect-urls)). В Authentication → SMTP Settings задайте Gmail SMTP: `smtp.gmail.com`, порт `465` (SSL) или `587` (TLS), полный адрес Gmail как username и sender address, App Password как пароль. Сохраните его только в Supabase и не используйте основной пароль почты.
6. В Authentication → Providers включите Google OAuth. В настройках Google OAuth-клиента добавьте Authorized JavaScript origin `https://konchampus.github.io` без пути репозитория и Authorized redirect URI из панели Supabase. Client ID/secret храните только в Supabase.
7. Для VK ID создайте OAuth2 custom provider `custom:vk-id` в Supabase: перенесите authorize/token/userinfo endpoints и callback URL из актуальной панели VK ID, оставьте PKCE включённым и внесите client ID/secret только в Supabase. PKCE включается по умолчанию для custom providers ([документация Supabase](https://supabase.com/docs/guides/auth/custom-oauth-providers)). До завершения этой настройки кнопка VK ID не заработает.
8. Задайте пользовательские Edge Function secrets через Supabase Dashboard → Edge Functions → Secrets или Supabase CLI ([документация Supabase](https://supabase.com/docs/guides/functions/secrets)):

   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` - пара VAPID и контактный subject для Web Push. В GitHub хранится только публичный `PUBLIC_VAPID_KEY`.
   - `CRON_SECRET` - случайная длинная строка для защиты `send-reminders`.

   Supabase автоматически передаёт Edge Functions project URL и карты ключей `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`; код берёт из них ключ по умолчанию и поддерживает старые `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Не создавайте собственные Edge secrets с префиксом `SUPABASE_`: он зарезервирован. Secret key остаётся только внутри Edge Functions и никогда не попадает в браузер.

   Сгенерируйте VAPID пару в терминале: `npx --yes web-push generate-vapid-keys --json`. Значение `publicKey` добавьте как GitHub Actions secret `PUBLIC_VAPID_KEY` и Supabase Edge secret `VAPID_PUBLIC_KEY`; `privateKey` - только как `VAPID_PRIVATE_KEY`. Задайте `VAPID_SUBJECT` как `mailto:<ваш адрес>` и создайте случайный длинный `CRON_SECRET`. Ключи не присылайте в чат.

   SMTP App Password, OAuth client secrets, `VAPID_PRIVATE_KEY` и `CRON_SECRET` нельзя класть в исходники, коммиты или GitHub variables. Никогда не используйте `service_role` в браузере.
9. Миграции включают `care_events` и `pets` в публикацию `supabase_realtime`: события ухода и изменения профиля сразу приходят в открытые семейные устройства. Для расписания включите расширения `pg_cron` и `pg_net`. В Database → Vault сохраните три значения: URL проекта под именем `project_url`, default Publishable key (или legacy anon key) под именем `publishable_key` и тот же `CRON_SECRET`, что задан в Edge Function Secrets. URL и ключ можно получить в Settings → API Keys; доступ к Vault из SQL использует Vault functions. После этого выполните в SQL Editor:

   ```sql
   select cron.schedule(
     'lapki-send-reminders',
     '* * * * *',
     $job$
       select net.http_post(
         url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
         ),
         body := '{}'::jsonb
       );
     $job$
   );
   ```

   Используется часовой пояс устройства. `send-reminders` принимает отдельный `CRON_SECRET`, а `apikey` нужен для вызова через Edge gateway ([пример Supabase с `pg_cron` и `pg_net`](https://supabase.com/docs/guides/functions/schedule-functions)). Не вставляйте секрет прямо в SQL, Git или GitHub.

Web Push сохраняет подтверждённые доставки по подпискам и при сетевом сбое повторяет отправку оставшимся устройствам. Если push-сервис принял сообщение, но ответ или запись квитанции потерялись, редкий дубль всё ещё возможен; повтор использует ту же метку браузера. Одновременно выполняется только одна отправка события или напоминания; зависшая попытка разблокируется через три минуты.
10. После успешного Pages deploy проверьте URL приложения, регистрацию и подтверждение email, вход email/логин, сброс пароля, создание семьи, приглашение, данные двух семей, все типы отметок, Realtime и push.

Приглашение можно создать в «Настройки → Моя семья». Ссылка действует семь дней и принимается однократно. Если указать email, приглашение можно принять только из аккаунта с этим адресом; приложение не отправляет приглашение по почте автоматически.

## Web Push на iPhone

Для push на iPhone/iPad нужны iOS/iPadOS 16.4 или новее, HTTPS, добавление сайта на экран «Домой» из Safari и разрешение уведомлений после нажатия «Включить уведомления» внутри установленного PWA. **Работа push на iPhone не подтверждена** - это можно подтвердить только реальной проверкой установленного PWA на устройстве.

## Данные и ограничения

Если сеть или сервер временно недоступны, события семьи и ожидающие push-уведомления остаются в локальных очередях. Синхронизация и уведомления повторяются при следующей загрузке семьи или восстановлении сети.

В локальном режиме записи хранятся в `localStorage` браузера; экспорт JSON можно восстановить в локальном режиме. В облачном режиме данные семьи и кэш разделены по семье и защищены RLS. Бесплатный Supabase может приостанавливать неактивный проект и не включает автоматические резервные копии; скачивайте резервную копию из «Настройки». Один аккаунт присоединяется к одной семье; для участия в другой семье нужен отдельный аккаунт.

Регистрация, login-by-username, приглашения, семейная синхронизация и отправка уведомлений требуют настроенного Supabase. Для email-подтверждения, Google/VK OAuth и push нужны учётные записи соответствующих сервисов. Сценарии с реальными аккаунтами, изоляция двух работающих семей и доставка push пока не проверялись на живом проекте.
