alter table public.shared_calendar_moments
  add column if not exists source_event_photo_id uuid
  references public.shared_calendar_photos(id) on delete set null;

create index if not exists shared_calendar_moments_source_photo_idx
  on public.shared_calendar_moments(source_event_photo_id)
  where source_event_photo_id is not null;

update public.shared_calendar_moments moment
set source_event_photo_id = (
  select link.photo_id
  from public.shared_calendar_moment_photos link
  where link.moment_id = moment.id
  order by link.position, link.photo_id
  limit 1
)
where moment.event_id is not null
  and moment.source_event_photo_id is null
  and exists (
    select 1
    from public.shared_calendar_moment_photos link
    where link.moment_id = moment.id
  );

create or replace function private.sync_shared_calendar_event_photo_to_moment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.shared_calendar_moments
    set source_event_photo_id = null, updated_at = now()
    where event_id = old.event_id
      and source_event_photo_id = old.photo_id;

    delete from public.shared_calendar_moment_photos link
    using public.shared_calendar_moments moment
    where link.moment_id = moment.id
      and moment.event_id = old.event_id
      and link.photo_id = old.photo_id;
    return old;
  end if;

  update public.shared_calendar_moments moment
  set source_event_photo_id = new.photo_id, updated_at = now()
  from public.shared_calendar_photos photo
  where moment.event_id = new.event_id
    and photo.id = new.photo_id
    and (photo.group_key = moment.group_key or photo.group_key = 'both');

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

create or replace function private.remove_shared_calendar_event_content_with_moment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.event_id is not null then
    if old.source_event_photo_id is not null then
      delete from public.shared_calendar_event_photos
      where event_id = old.event_id
        and photo_id = old.source_event_photo_id;
    end if;

    if old.source_event_mood_id is not null then
      delete from public.shared_calendar_event_moods
      where id = old.source_event_mood_id
        and event_id = old.event_id
        and author_user_id = old.author_user_id;
    end if;
  end if;
  return old;
end;
$$;

revoke all on function private.remove_shared_calendar_event_content_with_moment() from public;
revoke all on function private.remove_shared_calendar_event_content_with_moment() from anon;
revoke all on function private.remove_shared_calendar_event_content_with_moment() from authenticated;

drop trigger if exists remove_shared_calendar_event_content_with_moment
on public.shared_calendar_moments;
create trigger remove_shared_calendar_event_content_with_moment
after delete on public.shared_calendar_moments
for each row execute function private.remove_shared_calendar_event_content_with_moment();
