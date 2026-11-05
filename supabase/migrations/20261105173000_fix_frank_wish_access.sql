begin;

create or replace function public.get_shared_calendar_wishes()
returns table (
  id bigint,
  title text,
  category text,
  region text,
  place text,
  note text,
  status text,
  media_type text,
  release_date date,
  planned_watch_date date,
  owner_user_id uuid,
  owner_email text,
  participant_emails text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select lower(m.email) as email
    from public.shared_calendar_members m
    where lower(m.email) = lower(coalesce((select auth.jwt())->>'email', ''))
      and (select auth.uid()) is not null
  )
  select
    w.id,
    w.title,
    w.category,
    w.region,
    w.place,
    w.note,
    w.status,
    w.media_type,
    w.release_date,
    w.planned_watch_date,
    w.owner_user_id,
    w.owner_email,
    coalesce((
      select array_agg(person order by ordinal)
      from unnest(coalesce(w.participant_emails, '{}'::text[]))
        with ordinality as participants(person, ordinal)
      where private.can_interact_with_shared_calendar_member(person)
    ), '{}'::text[])
  from public.shared_calendar_wishes w
  cross join viewer v
  where private.can_access_shared_calendar_group(w.audience_group)
    and private.can_interact_with_shared_calendar_member(w.owner_email)
    and private.can_access_shared_calendar_content(w.created_at, w.owner_user_id)
    and not exists (
      select 1
      from unnest(coalesce(w.participant_emails, '{}'::text[])) participant(email)
      where not private.can_interact_with_shared_calendar_member(participant.email)
    )
  order by w.updated_at desc;
$$;

create or replace function public.toggle_shared_calendar_wish_participation(p_wish_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_email text;
  wish_owner text;
  wish_created_at timestamptz;
  wish_owner_user_id uuid;
  wish_participants text[];
  wish_audience_group text;
  already_joined boolean;
begin
  select m.email into member_email
  from public.shared_calendar_members m
  where lower(m.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and (select auth.uid()) is not null;

  if member_email is null then
    raise exception 'Not an invited member';
  end if;

  select
    w.owner_email,
    w.created_at,
    w.owner_user_id,
    w.participant_emails,
    w.audience_group,
    exists (
      select 1
      from unnest(coalesce(w.participant_emails, '{}'::text[])) participant(email)
      where lower(participant.email) = lower(member_email)
    )
  into
    wish_owner,
    wish_created_at,
    wish_owner_user_id,
    wish_participants,
    wish_audience_group,
    already_joined
  from public.shared_calendar_wishes w
  where w.id = p_wish_id;

  if wish_owner is null
     or not private.can_access_shared_calendar_group(wish_audience_group)
     or not private.can_interact_with_shared_calendar_member(wish_owner)
     or not private.can_access_shared_calendar_content(wish_created_at, wish_owner_user_id)
     or exists (
       select 1
       from unnest(coalesce(wish_participants, '{}'::text[])) participant(email)
       where not private.can_interact_with_shared_calendar_member(participant.email)
     ) then
    raise exception 'Wish not found';
  end if;

  if lower(wish_owner) = lower(member_email) then
    return true;
  end if;

  update public.shared_calendar_wishes
  set participant_emails = case
    when already_joined then array(
      select participant.email
      from unnest(coalesce(participant_emails, '{}'::text[])) participant(email)
      where lower(participant.email) <> lower(member_email)
    )
    else coalesce(participant_emails, '{}'::text[]) || member_email
  end,
  updated_at = now()
  where id = p_wish_id;

  return not already_joined;
end;
$$;

commit;
