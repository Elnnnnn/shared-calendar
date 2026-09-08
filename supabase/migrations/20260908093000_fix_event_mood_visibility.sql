drop policy if exists "participants and moment viewers view moods"
on public.shared_calendar_event_moods;

create policy "participants and moment viewers view moods"
on public.shared_calendar_event_moods for select to authenticated
using (
  exists (
    select 1
    from public.shared_calendar_events e
    where e.id = shared_calendar_event_moods.event_id
      and (
        lower(e.owner_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
        or lower(coalesce((select auth.jwt()) ->> 'email', '')) = any (
          select lower(value) from unnest(e.participant_emails) as value
        )
      )
  )
  or exists (
    select 1
    from public.shared_calendar_moments m
    where m.event_id = shared_calendar_event_moods.event_id
      and (select private.can_access_shared_calendar_group(m.group_key))
  )
);
