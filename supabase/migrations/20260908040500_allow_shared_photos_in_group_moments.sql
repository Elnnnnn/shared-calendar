drop policy if exists "authors attach moment photos" on public.shared_calendar_moment_photos;
create policy "authors attach moment photos"
on public.shared_calendar_moment_photos for insert to authenticated
with check (
  exists (
    select 1
    from public.shared_calendar_moments m
    join public.shared_calendar_photos p on p.id = photo_id
    where m.id = moment_id
      and m.author_user_id = (select auth.uid())
      and (m.group_key = p.group_key or p.group_key = 'both')
  )
);
