create index if not exists shared_calendar_event_photos_photo_idx
  on public.shared_calendar_event_photos(photo_id);

create index if not exists shared_calendar_event_photos_linked_by_idx
  on public.shared_calendar_event_photos(linked_by_user_id);
