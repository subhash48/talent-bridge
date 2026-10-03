-- Talent Bridge migration 010: sign-in accounts
-- Purpose: link the people who sign in to their Supabase Auth accounts. Additive only: no existing
-- row or column is changed or removed.
--
-- users.auth_user_id   the Supabase Auth account (auth.users.id) a users row signs in with. The API
--                      verifies the access token, then loads the users row with auth_user_id = sub;
--                      the role on that row, never the token or the browser, decides access.
-- users.disabled_at    revokes access at once, even while an access token is still valid.
-- candidates.user_id   a candidate's own users row (role candidate), so the portal finds their
--                      record by id instead of matching email addresses on every request.
--
-- Accounts are linked with `python -m app.db.accounts link EMAIL` (see README). Nothing here links
-- by email: the backend only does that for candidates who confirmed their address themselves.

alter table public.users
  add column auth_user_id uuid unique references auth.users (id) on delete set null,
  add column disabled_at  timestamptz;

alter table public.candidates
  add column user_id uuid unique references public.users (id) on delete set null;

-- A candidate users row created before this migration belongs to the candidate with its address.
-- Both rows are ours, so this links nothing that wasn't already the same person.
update public.candidates c
set user_id = u.id
from public.users u
where u.role = 'candidate'
  and u.email = c.email
  and c.user_id is null;
