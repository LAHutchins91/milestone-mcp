# Durable JSON store (prep only)

Keeps the exact same JSON document shape as the local file store, but persists one row in `milestone_private.store`.

## Enable
1. Apply `durable_json_store.sql` in Supabase project for milestone.
2. Expose `milestone_private` to PostgREST **or** rely on service-role + `Accept-Profile` / `Content-Profile` headers (the app sends both).
3. Set Vercel env `SUPABASE_SERVICE_ROLE_KEY` (server-only). `SUPABASE_URL` already present.
4. Redeploy. Without the service role key, the app keeps using local JSON (`MILESTONE_DATA_PATH` or `~/.milestone/milestone.json`).

## Concurrency
Writes use optimistic `revision` compare-and-swap with retries so concurrent instances do not clobber each other.
