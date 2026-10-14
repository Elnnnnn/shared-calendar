alter table public.shared_calendar_moment_photos
  add column if not exists uploaded_from_moment boolean not null default false;

comment on column public.shared_calendar_moment_photos.uploaded_from_moment is
  'True only when the photo was uploaded through this moment composer.';

update public.shared_calendar_moment_photos link
set uploaded_from_moment = true
from public.shared_calendar_moments moment,
     public.shared_calendar_photos photo
where moment.id = link.moment_id
  and photo.id = link.photo_id
  and moment.event_id is null
  and photo.event_id is null
  and moment.author_user_id = photo.uploader_user_id
  and photo.created_at between moment.created_at - interval '30 minutes'
                           and moment.created_at + interval '1 minute';
