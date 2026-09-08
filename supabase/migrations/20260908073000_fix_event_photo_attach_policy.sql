drop policy if exists "event participants attach event photos" on public.shared_calendar_event_photos;

create policy "event participants attach event photos"
on public.shared_calendar_event_photos for insert to authenticated
with check (
  linked_by_user_id = (select auth.uid())
  and lower(linked_by_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  and exists (
    select 1
    from public.shared_calendar_events e
    join public.shared_calendar_photos p
      on p.id = shared_calendar_event_photos.photo_id
    where e.id = shared_calendar_event_photos.event_id
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
