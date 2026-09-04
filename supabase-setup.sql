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

-- ---------------------------------------------------------------------------
-- Who people are
-- ---------------------------------------------------------------------------

-- One row per account: the name they chose, how they answered the gender
-- question, and their picture. Readable by everybody, because a comment shows
-- the name and face of whoever wrote it.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  gender     text check (gender in ('f', 'm', 'other', 'unsaid')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles"
  on public.profiles for select to anon, authenticated
  using (true);

drop policy if exists "you make your own profile" on public.profiles;
create policy "you make your own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "you change your own profile" on public.profiles;
create policy "you change your own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- A username is how people are known to each other, so it is fixed once
-- chosen: an update may change the picture or the gender answer and nothing
-- else. Enforced here rather than in the page, which anyone can edit.
create or replace function public.freeze_username()
returns trigger
language plpgsql
as $$
begin
  new.id       := old.id;
  new.username := old.username;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists freeze_username on public.profiles;
create trigger freeze_username
  before update on public.profiles
  for each row execute function public.freeze_username();

-- ---------------------------------------------------------------------------
-- Comments under a place
-- ---------------------------------------------------------------------------

-- Unlike a submission, a comment is published the moment it is written. There
-- is no queue: it is somebody talking, not a claim about the map.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  place_id   text not null,
  place_name text default '',
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- A reply is a comment with a parent. One level only: replying to a reply
-- still hangs off the original, so a thread cannot march off the side of a
-- phone screen.
alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_place_idx on public.comments (place_id, created_at desc);
create index if not exists comments_parent_idx on public.comments (parent_id);

-- Same trick as submissions: the browser does not get to say who it is.
create or replace function public.stamp_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id    := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_comment on public.comments;
create trigger stamp_comment
  before insert on public.comments
  for each row execute function public.stamp_comment();

alter table public.comments enable row level security;

drop policy if exists "anyone can read comments" on public.comments;
create policy "anyone can read comments"
  on public.comments for select to anon, authenticated
  using (true);

/* One comment every five minutes, per person, counted by the database.
 *
 * The page never shows a countdown and never mentions the rule, so there is
 * no timer to watch and nothing to work around: a second comment inside the
 * window is simply refused. Doing this in the browser would stop nobody —
 * anyone can edit the page they are looking at. Here it holds. */
drop policy if exists "signed in can comment, slowly" on public.comments;
create policy "signed in can comment, slowly"
  on public.comments for insert to authenticated
  with check (
    auth.uid() is not null
    and not exists (
      select 1 from public.comments c
      where c.user_id = auth.uid()
        and c.created_at > now() - interval '5 minutes'
    )
  );

-- No update policy of any kind, deliberately: once said, a comment cannot be
-- rewritten by its author or by anybody else. It can only be removed.
drop policy if exists "admin removes a comment" on public.comments;
create policy "admin removes a comment"
  on public.comments for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "anyone sees avatars" on storage.objects;
create policy "anyone sees avatars"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "you upload your own avatar" on storage.objects;
create policy "you upload your own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "you replace your own avatar" on storage.objects;
create policy "you replace your own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Where you have been
-- ---------------------------------------------------------------------------

/* A private list: the places somebody has actually used.
 *
 * Unlike every other table here, this one is not public and never will be.
 * Where a person has been is nobody else's business — not other visitors, not
 * the owner of the map. The select policy is `user_id = auth.uid()` with no
 * admin exception, so the only account that can read a row is the one that
 * wrote it. */
create table if not exists public.visits (
  place_id   text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  place_name text default '',
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create index if not exists visits_user_idx on public.visits (user_id);

create or replace function public.stamp_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_visit on public.visits;
create trigger stamp_visit
  before insert on public.visits
  for each row execute function public.stamp_visit();

alter table public.visits enable row level security;

-- No "anyone can read" here, and no admin exception, on purpose.
drop policy if exists "you read only your own visits" on public.visits;
create policy "you read only your own visits"
  on public.visits for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "you record your own visits" on public.visits;
create policy "you record your own visits"
  on public.visits for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "you forget your own visits" on public.visits;
create policy "you forget your own visits"
  on public.visits for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- How good the toilet was, out of five
-- ---------------------------------------------------------------------------

-- Keyed on (place, person): one score each, changed by scoring again rather
-- than added to. Nobody can stuff a place's average by voting twice.
create table if not exists public.ratings (
  place_id   text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  place_name text default '',
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create index if not exists ratings_place_idx on public.ratings (place_id);

create or replace function public.stamp_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_rating on public.ratings;
create trigger stamp_rating
  before insert on public.ratings
  for each row execute function public.stamp_rating();

alter table public.ratings enable row level security;

drop policy if exists "anyone can read ratings" on public.ratings;
create policy "anyone can read ratings"
  on public.ratings for select to anon, authenticated
  using (true);

drop policy if exists "you give your own score" on public.ratings;
create policy "you give your own score"
  on public.ratings for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "you change your own score" on public.ratings;
create policy "you change your own score"
  on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "you take back your own score" on public.ratings;
create policy "you take back your own score"
  on public.ratings for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Likes and dislikes
-- ---------------------------------------------------------------------------

-- The key is (comment, person), so one person holds at most one opinion per
-- comment. Changing your mind is an update of that row and voting twice is
-- impossible — counted by the database rather than trusted from the page.
create table if not exists public.reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  vote       smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists reactions_comment_idx on public.reactions (comment_id);

create or replace function public.stamp_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_reaction on public.reactions;
create trigger stamp_reaction
  before insert on public.reactions
  for each row execute function public.stamp_reaction();

alter table public.reactions enable row level security;

drop policy if exists "anyone can read reactions" on public.reactions;
create policy "anyone can read reactions"
  on public.reactions for select to anon, authenticated
  using (true);

drop policy if exists "you cast your own vote" on public.reactions;
create policy "you cast your own vote"
  on public.reactions for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "you change your own vote" on public.reactions;
create policy "you change your own vote"
  on public.reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "you take back your own vote" on public.reactions;
create policy "you take back your own vote"
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

/* Told to one person: somebody liked, disliked or replied to what they wrote.
 *
 * There is deliberately no insert policy. Nobody may write a notification —
 * not even for themselves — because a table anyone can insert into is a table
 * anyone can use to shout at a stranger. They appear only as a side effect of
 * a real vote or a real reply, made by the triggers below, which run as the
 * definer and so are the one exception. */
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  kind       text not null check (kind in ('like', 'dislike', 'reply')),
  comment_id uuid references public.comments (id) on delete cascade,
  place_id   text,
  place_name text default '',
  seen       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_for_idx
  on public.notifications (user_id, seen, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "you read only your own" on public.notifications;
create policy "you read only your own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Marking one as read is the only change anybody can make to it.
drop policy if exists "you mark your own as seen" on public.notifications;
create policy "you mark your own as seen"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "you clear your own" on public.notifications;
create policy "you clear your own"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Somebody voted on a comment. Tell whoever wrote it — unless they voted on
-- their own, which is not news.
create or replace function public.notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  place text;
  pname text;
begin
  select c.user_id, c.place_id, c.place_name
    into owner, place, pname
    from public.comments c where c.id = new.comment_id;

  if owner is null or owner = new.user_id then
    return new;
  end if;

  /* One row per person per comment, flipped in place when somebody changes
   * their mind — so switching like to dislike and back cannot be used to
   * ring the same bell over and over. */
  delete from public.notifications
    where user_id = owner and actor_id = new.user_id
      and comment_id = new.comment_id and kind in ('like', 'dislike');

  insert into public.notifications (user_id, actor_id, kind, comment_id, place_id, place_name)
    values (owner, new.user_id,
            case when new.vote = 1 then 'like' else 'dislike' end,
            new.comment_id, place, pname);

  return new;
end;
$$;

drop trigger if exists notify_reaction on public.reactions;
create trigger notify_reaction
  after insert or update on public.reactions
  for each row execute function public.notify_reaction();

-- Somebody replied. Tell the person they replied to.
create or replace function public.notify_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select c.user_id into owner from public.comments c where c.id = new.parent_id;

  if owner is null or owner = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, kind, comment_id, place_id, place_name)
    values (owner, new.user_id, 'reply', new.id, new.place_id, new.place_name);

  return new;
end;
$$;

drop trigger if exists notify_reply on public.comments;
create trigger notify_reply
  after insert on public.comments
  for each row execute function public.notify_reply();
