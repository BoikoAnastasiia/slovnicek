# Supabase setup (one-time)

1. Create a project at supabase.com → copy Project URL + anon key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Authentication → Providers → Google → enable; create OAuth credentials in
   Google Cloud Console (type: Web application), authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Authentication → URL Configuration → add `http://localhost:3000/profile`
   and your production URL to Redirect URLs.
