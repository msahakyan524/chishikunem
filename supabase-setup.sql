-- Chishik unem — database setup
--
-- Paste this whole file into the Supabase SQL editor and press Run. It is safe
-- to run twice: everything is written so that a second run changes nothing.
--
-- This file is the part that actually enforces the rules. cloud.js, the
-- suggestion form and admin.html are only a convenient way to call it, and a
-- visitor can edit all three in their own browser. What they cannot edit is
-- what follows, because it runs on the server.
--
-- The three rules that matter:
--   1. Anyone signed in may send a submission, and it is always `pending`.
--   2. You may read your own submissions. Nobody else's.
--   3. Only an email listed in `admins` may approve, turn down, or publish.

-- ---------------------------------------------------------------------------
-- Who is allowed to review
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  email text primary key
);

-- No policies are added to this table on purpose. With row-level security on
-- and no policy granting anything, no visitor can read it or write to it — not
-- even to find out who the admins are. Only the function below sees it.
alter table public.admins enable row level security;

-- IMPORTANT: put your own email here, exactly as you type it when signing in.
insert into public.admins (email) values ('you@example.com')
  on conflict (email) do nothing;

-- Signing in with a username instead? A username is stored as an email with a
-- made-up domain on the end, so the admin row is the same shape. For the
-- username `maria`, add:
--
--   insert into public.admins (email) values ('maria@chishikunem.invalid')
--     on conflict (email) do nothing;
--
-- `.invalid` is reserved by RFC 2606 and can never be a real address, which is
-- exactly why it is used: the name identifies the account and nothing more.

-- `security definer` lets this one function read `admins` despite the lockout
-- above. It is the single place the question "is this person an admin?" is
-- answered, and every policy below asks it rather than trusting the browser.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- What people send in
-- ---------------------------------------------------------------------------

create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  place_id    text not null,
  place_name  text default '',
  place_lat   double precision,
  place_lon   double precision,
  user_id     uuid not null references auth.users (id) on delete cascade,
  user_email  text,
  facts       jsonb not null default '{}'::jsonb,
  note        text default '',
  photo_path  text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  admin_note  text default '',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create index if not exists submissions_status_idx on public.submissions (status, created_at);
create index if not exists submissions_user_idx on public.submissions (user_id);

-- The browser is not asked politely to send the right owner and status — they
-- are overwritten here on the way in. So it does not matter what someone types
-- into the console: their submission is theirs, and it is pending.
create or replace function public.stamp_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id    := auth.uid();
  new.user_email := auth.jwt() ->> 'email';
  new.status     := 'pending';
  new.admin_note := '';
  new.created_at := now();
  new.decided_at := null;
  return new;
end;
$$;

drop trigger if exists stamp_submission on public.submissions;
create trigger stamp_submission
  before insert on public.submissions
  for each row execute function public.stamp_submission();

alter table public.submissions enable row level security;

drop policy if exists "signed in can send" on public.submissions;
create policy "signed in can send"
  on public.submissions for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "see your own, admin sees all" on public.submissions;
create policy "see your own, admin sees all"
  on public.submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Deliberately no update policy for the sender. A submission cannot be edited
-- after it is sent, by anyone but an admin — otherwise an approved answer
-- could be quietly rewritten into something else after you had checked it.
drop policy if exists "admin decides" on public.submissions;
create policy "admin decides"
  on public.submissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin removes" on public.submissions;
create policy "admin removes"
  on public.submissions for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- What the map shows
-- ---------------------------------------------------------------------------

-- Approved answers only. This is the one table a stranger's browser reads
-- without signing in, and the only way anything reaches the public map.
create table if not exists public.public_facts (
  place_id   text primary key,
  place_name text default '',
  facts      jsonb not null default '{}'::jsonb,
  note       text default '',
  photo_url  text,
  updated_at timestamptz not null default now()
);

alter table public.public_facts enable row level security;

drop policy if exists "anyone can read" on public.public_facts;
create policy "anyone can read"
  on public.public_facts for select to anon, authenticated
  using (true);

drop policy if exists "admin publishes" on public.public_facts;
create policy "admin publishes"
  on public.public_facts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

-- Two buckets, because a photo waiting to be checked and a photo on the public
-- map are different things. `pending` is private: only the person who sent the
-- photo and an admin can look at it. `photos` is public, and nothing arrives
-- in it except by being approved.
insert into storage.buckets (id, name, public)
  values ('pending', 'pending', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('photos', 'photos', true)
  on conflict (id) do nothing;

-- Uploads go to a folder named after the sender's own user id, which is what
-- the first path segment check below pins them to. You cannot write into
-- somebody else's folder, and you cannot read out of one.
drop policy if exists "send a photo" on storage.objects;
create policy "send a photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pending'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "see your own photo" on storage.objects;
create policy "see your own photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pending'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "admin tidies pending" on storage.objects;
create policy "admin tidies pending"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pending' and public.is_admin());

drop policy if exists "admin publishes a photo" on storage.objects;
create policy "admin publishes a photo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "admin replaces a photo" on storage.objects;
create policy "admin replaces a photo"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "anyone sees published photos" on storage.objects;
create policy "anyone sees published photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos');
