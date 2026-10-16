-- ============================================================================
-- SimePark — 0003 grant the first administrator
-- ============================================================================
-- This file is a TEMPLATE. It is not run automatically, and it must not be: the
-- whole point is that administrator rights can only be granted by someone with
-- access to this database, not by any request the app can make.
--
-- WHY THIS SHAPE
--   * public.admin_user_ids has Row Level Security enabled and NO policies. No
--     anon or authenticated API request can read, insert, update or delete a row.
--   * Nothing in the application inserts into it. There is no "make me admin"
--     button, endpoint, or client function anywhere in the codebase.
--   * Therefore the only ways to add the first administrator are the Supabase
--     SQL Editor (which runs as the table owner) or a service_role key. A normal
--     signed-up user cannot promote themselves by any route.
--
-- HOW TO USE
--   1. Sign up normally through the app, and confirm your email address.
--   2. In Supabase, open Authentication > Users and copy your user's UUID.
--   3. Replace the placeholder below with that UUID.
--   4. Run this statement in the SQL Editor.
--   5. Reload the app: the "Admin" entry point appears, and only then.
--
-- To revoke administrator rights, delete the row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 (optional but recommended): list your users so you can copy the UUID.
-- ---------------------------------------------------------------------------
-- select id, email, created_at, email_confirmed_at
-- from auth.users
-- order by created_at desc;


-- ---------------------------------------------------------------------------
-- STEP 2: grant the role. Replace the UUID with your own.
-- ---------------------------------------------------------------------------
-- insert into public.admin_user_ids (user_id, note)
-- values ('00000000-0000-0000-0000-000000000000', 'first administrator')
-- on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------------
-- STEP 3: verify. Expect exactly one row per administrator.
-- ---------------------------------------------------------------------------
-- select a.user_id, u.email, a.granted_at, a.note
-- from public.admin_user_ids a
-- join auth.users u on u.id = a.user_id
-- order by a.granted_at;


-- ---------------------------------------------------------------------------
-- STEP 4: confirm the privilege actually behaves as intended.
-- Run this as a signed-in non-admin in the app's SQL console (or via the
-- REST API with their access token) and expect an empty result / permission
-- denied, never a successful insert:
--
--   insert into public.admin_user_ids (user_id) values (auth.uid());
--
-- The expected outcome is: ERROR: new row violates row-level security policy.
-- That error is the security property this design depends on.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- REVOKING ADMINISTRATOR RIGHTS
-- ---------------------------------------------------------------------------
-- delete from public.admin_user_ids where user_id = '00000000-0000-0000-0000-000000000000';


-- ---------------------------------------------------------------------------
-- DELETING A USER ENTIRELY (account deletion procedure)
-- ---------------------------------------------------------------------------
-- The app deliberately holds no service_role key, so it cannot delete an auth
-- user. Removing the account is an operator action. Private data is removed by
-- cascade, so deleting the auth user is sufficient.
--
-- Either delete the user in Authentication > Users in the dashboard, or run:
--
-- delete from auth.users where email = 'user@example.com';
--
-- Cascading deletes remove the profile, preferences, saved scenarios, saved
-- properties, comparison history and activity log for that user.
