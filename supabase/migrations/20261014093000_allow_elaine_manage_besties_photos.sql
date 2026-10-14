create policy "Elaine manages besties photos"
on public.shared_calendar_photos
for delete
to authenticated
using (
  group_key = 'besties'
  and lower(coalesce((select auth.jwt())->>'email', '')) = 'elainezhang1110@gmail.com'
);

create policy "Elaine removes besties photos from albums"
on public.shared_calendar_album_photos
for delete
to authenticated
using (
  lower(coalesce((select auth.jwt())->>'email', '')) = 'elainezhang1110@gmail.com'
  and exists (
    select 1
    from public.shared_calendar_photos photo
    where photo.id = photo_id
      and photo.group_key = 'besties'
  )
);
