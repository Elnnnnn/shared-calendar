alter table public.shared_calendar_photos
  drop constraint shared_calendar_photos_group_key_check;

alter table public.shared_calendar_photos
  add constraint shared_calendar_photos_group_key_check
  check (group_key = any (array['besties'::text, 'friends'::text, 'both'::text]));

drop policy "members upload own group photos"
  on public.shared_calendar_photos;

create policy "members upload own group photos"
on public.shared_calendar_photos
for insert
to authenticated
with check (
  uploader_user_id = (select auth.uid())
  and lower(uploader_email) = lower(coalesce((select auth.jwt())->>'email', ''))
  and private.can_assign_shared_calendar_group(group_key)
  and group_key = any (array['besties'::text, 'friends'::text, 'both'::text])
);

create unique index shared_calendar_one_photo_per_event
  on public.shared_calendar_photos (event_id)
  where event_id is not null;
