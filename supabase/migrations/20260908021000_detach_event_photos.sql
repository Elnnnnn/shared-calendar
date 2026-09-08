/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
revoke update on table public.shared_calendar_photos from anon;
revoke update on table public.shared_calendar_photos from authenticated;
grant update (event_id) on table public.shared_calendar_photos to authenticated;

create policy "uploaders detach photos from events"
on public.shared_calendar_photos
for update
to authenticated
using ((select auth.uid()) = uploader_user_id)
with check (
  (select auth.uid()) = uploader_user_id
  and private.can_assign_shared_calendar_group(group_key)
);
