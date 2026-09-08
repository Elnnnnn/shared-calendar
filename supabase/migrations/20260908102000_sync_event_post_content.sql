alter table public.shared_calendar_moments
  add column if not exists source_event_mood_id bigint
  references public.shared_calendar_event_moods(id) on delete set null;

create index if not exists shared_calendar_moments_source_mood_idx
  on public.shared_calendar_moments(source_event_mood_id)
  where source_event_mood_id is not null;

update public.shared_calendar_moments moment
set source_event_mood_id = (
  select mood.id
  from public.shared_calendar_event_moods mood
  where mood.event_id = moment.event_id
    and lower(mood.author_email) = lower(moment.author_email)
    and mood.body = moment.caption
  order by mood.created_at, mood.id
  limit 1
)
where moment.event_id is not null
  and moment.caption <> ''
  and moment.source_event_mood_id is null
  and exists (
    select 1
    from public.shared_calendar_event_moods mood
    where mood.event_id = moment.event_id
      and lower(mood.author_email) = lower(moment.author_email)
      and mood.body = moment.caption
  );

create or replace function private.sync_shared_calendar_event_photo_to_moment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.shared_calendar_moment_photos link
    using public.shared_calendar_moments moment
    where link.moment_id = moment.id
      and moment.event_id = old.event_id
      and link.photo_id = old.photo_id;
    return old;
  end if;

  insert into public.shared_calendar_moment_photos(moment_id, photo_id, position)
  select moment.id, new.photo_id, 0
  from public.shared_calendar_moments moment
  join public.shared_calendar_photos photo on photo.id = new.photo_id
  where moment.event_id = new.event_id
    and (photo.group_key = moment.group_key or photo.group_key = 'both')
  on conflict (moment_id, photo_id) do nothing;
  return new;
end;
$$;

revoke all on function private.sync_shared_calendar_event_photo_to_moment() from public;
revoke all on function private.sync_shared_calendar_event_photo_to_moment() from anon;
revoke all on function private.sync_shared_calendar_event_photo_to_moment() from authenticated;

drop trigger if exists sync_shared_calendar_event_photo_to_moment
on public.shared_calendar_event_photos;
create trigger sync_shared_calendar_event_photo_to_moment
after insert or delete on public.shared_calendar_event_photos
for each row execute function private.sync_shared_calendar_event_photo_to_moment();

create or replace function private.sync_shared_calendar_source_mood_to_moment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.shared_calendar_moments
    set caption = '', source_event_mood_id = null, updated_at = now()
    where source_event_mood_id = old.id;
    return old;
  end if;

  update public.shared_calendar_moments
  set caption = new.body, updated_at = now()
  where source_event_mood_id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_shared_calendar_source_mood_to_moment() from public;
revoke all on function private.sync_shared_calendar_source_mood_to_moment() from anon;
revoke all on function private.sync_shared_calendar_source_mood_to_moment() from authenticated;

drop trigger if exists sync_shared_calendar_source_mood_to_moment
on public.shared_calendar_event_moods;
create trigger sync_shared_calendar_source_mood_to_moment
before update of body or delete on public.shared_calendar_event_moods
for each row execute function private.sync_shared_calendar_source_mood_to_moment();
