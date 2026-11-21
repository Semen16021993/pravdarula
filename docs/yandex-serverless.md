# Deploy to Yandex Serverless Containers

The application is built as a standalone Nitro Node server. The container listens on `0.0.0.0:8080`.

## Build-time variables

Pass only public Supabase settings as Docker build arguments:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_PROJECT_ID`

Example:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  --build-arg VITE_SUPABASE_PROJECT_ID="$VITE_SUPABASE_PROJECT_ID" \
  --build-arg SUPABASE_PROJECT_ID="$SUPABASE_PROJECT_ID" \
  -t pravdarula:latest .
```

Never pass `SUPABASE_SERVICE_ROLE_KEY` or `YANDEX_PAY_API_KEY` as build arguments. Configure them only as runtime environment variables in Yandex Cloud.

## Runtime variables

Configure these in the Serverless Container revision:

- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — public Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service-role key; keep it out of browser code and image build arguments.
- `YANDEX_PAY_ENV` — `sandbox` for tests or `live` for real payments.
- `YANDEX_PAY_API_KEY` — server-only Yandex Pay merchant API key.

Use `.env.example` as a variable-name checklist, not as a source of real credentials.

## Email one-time-code login

The login screen requests an OTP through Supabase Auth (`signInWithOtp`) and verifies it with `verifyOtp`. For numeric codes to arrive by email:

1. Configure a working SMTP provider in Supabase Auth.
2. Configure the relevant email template to render `{{ .Token }}` (not only a confirmation URL).
3. Verify the sender domain and sender address with the SMTP provider.

The previous development endpoint that created users and returned their OTP directly to the browser has been removed.
