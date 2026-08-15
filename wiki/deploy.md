# Deploy & infrastructure

- **Live:** https://seder-plum.vercel.app - Vercel project `seder`
  (team `team_c4EzgDeSj9ZbyrC4KG1oDgd4`), framework Vite, SPA rewrite in
  `vercel.json`. **Every push to `main` deploys.**
- **Repo:** https://github.com/Chocho88/seder (public). GitHub token is in
  the Mac's keychain; `git push` needs nothing. `scripts/push-once.sh`
  re-stores a token if it ever rotates (never echoes it).
- **Supabase:** project `mzvmhjurvpstlbfzkuid` (Frankfurt). Public URL +
  anon key ship in `src/lib/publicConfig.ts` (public by design; RLS is the
  guard) - so **no Vercel env vars are needed**. `.env.local` overrides in dev.
  Schema: `supabase/schema.sql` (already applied). Realtime on. Auth: Email
  provider on, "Confirm email" off, Site URL = the vercel URL, redirect
  allow-list = vercel URL + `http://localhost:5183/**`.
- **Design system:** vendored copy in `vendor/design-system` for a
  standalone build; source of truth stays `../design-system`;
  `scripts/sync-design-system.sh` mirrors it (never edit vendor/ directly).
- **PWA:** `public/manifest.webmanifest`, icons rendered by
  `scripts/make-icon.mjs` (green field + grid + סדר wordmark in Migdal
  Haemeq). iOS caches home-screen icons: remove + re-add to refresh.
- **Production behavior:** demo seed runs only in DEV or `?seed=fresh`; a
  fresh device starts with an empty Pool and fills from sync after sign-in.
- Dashboard access: the app's browser pane held a Supabase session once; if
  it's gone, the user signs in with "in." and you drive - never send them
  clicking.
