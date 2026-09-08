create table if not exists public.shared_calendar_event_photos (
  event_id bigint primary key references public.shared_calendar_events(id) on delete cascade,
  photo_id uuid not null references public.shared_calendar_photos(id) on delete cascade,
  linked_by_user_id uuid not null references auth.users(id) on delete cascade,
  linked_by_email text not null,
  created_at timestamptz not null default now()
);

alter table public.shared_calendar_event_photos enable row level security;
grant select, insert, delete on public.shared_calendar_event_photos to authenticated;

drop policy if exists "event participants view event photos" on public.shared_calendar_event_photos;
create policy "event participants view event photos"
on public.shared_calendar_event_photos for select to authenticated
using (
  exists (
    select 1 from public.shared_calendar_events e
    where e.id = event_id
      and (
        lower(e.owner_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
        or lower(coalesce((select auth.jwt()) ->> 'email', '')) = any (
          select lower(value) from unnest(e.participant_emails) as value
        )
      )
  )
);

drop policy if exists "event participants attach event photos" on public.shared_calendar_event_photos;
create policy "event participants attach event photos"
on public.shared_calendar_event_photos for insert to authenticated
with check (
  linked_by_user_id = (select auth.uid())
  and lower(linked_by_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  and exists (
    select 1
    from public.shared_calendar_events e
    join public.shared_calendar_photos p on p.id = photo_id
    where e.id = event_id
      and (
        lower(e.owner_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
        or lower(coalesce((select auth.jwt()) ->> 'email', '')) = any (
          select lower(value) from unnest(e.participant_emails) as value
        )
      )
      and (
        (coalesce(e.audience_group, 'both') = 'both' and p.group_key in ('besties', 'friends', 'both'))
        or (e.audience_group = 'besties' and p.group_key in ('besties', 'both'))
        or (e.audience_group = 'friends' and p.group_key in ('friends', 'both'))
      )
  )
);

drop policy if exists "event participants detach event photos" on public.shared_calendar_event_photos;
create policy "event participants detach event photos"
on public.shared_calendar_event_photos for delete to authenticated
using (
  exists (
    select 1 from public.shared_calendar_events e
    where e.id = event_id
      and (
        lower(e.owner_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
        or lower(coalesce((select auth.jwt()) ->> 'email', '')) = any (
          select lower(value) from unnest(e.participant_emails) as value
        )
      )
  )
);

insert into public.shared_calendar_event_photos (event_id, photo_id, linked_by_user_id, linked_by_email, created_at)
select event_id, id, uploader_user_id, uploader_email, created_at
from public.shared_calendar_photos
where event_id is not null
on conflict (event_id) do nothing;

update public.shared_calendar_photos set event_id = null where event_id is not null;
drop index if exists public.shared_calendar_one_photo_per_event_idx;
