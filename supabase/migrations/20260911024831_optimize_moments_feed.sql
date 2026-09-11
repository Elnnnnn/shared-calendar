alter table public.shared_calendar_moment_likes
  add column if not exists read_at timestamptz;

create index if not exists shared_calendar_moment_likes_created_idx
  on public.shared_calendar_moment_likes(moment_id, created_at desc);

create or replace function public.get_shared_calendar_moment_stats(p_moment_ids bigint[])
returns table(moment_id bigint, like_count bigint, comment_count bigint, liked_by_me boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select moment.id,
    (select count(*) from public.shared_calendar_moment_likes likes where likes.moment_id = moment.id),
    (select count(*) from public.shared_calendar_moment_comments comments where comments.moment_id = moment.id)
      + (select count(*) from public.shared_calendar_event_moods moods where moods.event_id = moment.event_id and moods.id is distinct from moment.source_event_mood_id),
    exists (select 1 from public.shared_calendar_moment_likes likes where likes.moment_id = moment.id and likes.user_id = (select auth.uid()))
  from public.shared_calendar_moments moment
  where moment.id = any(p_moment_ids);
$$;

create or replace function public.get_shared_calendar_moment_comment_preview(p_moment_ids bigint[], p_limit integer default 3)
returns setof public.shared_calendar_moment_comments
language sql
stable
security invoker
set search_path = ''
as $$
  select ranked.id, ranked.moment_id, ranked.author_user_id, ranked.author_email,
    ranked.body, ranked.created_at, ranked.reply_to_comment_id,
    ranked.reply_to_event_mood_id, ranked.reply_to_user_id, ranked.reply_to_email,
    ranked.reply_read_at
  from (
    select comments.*, row_number() over (partition by comments.moment_id order by comments.created_at desc, comments.id desc) as row_number
    from public.shared_calendar_moment_comments comments
    where comments.moment_id = any(p_moment_ids)
  ) ranked
  where ranked.row_number <= greatest(1, least(p_limit, 10))
  order by ranked.created_at, ranked.id;
$$;

create or replace function public.mark_shared_calendar_moment_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
  likes_changed integer := 0;
  replies_changed integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  update public.shared_calendar_moment_comments
  set reply_read_at = now()
  where reply_to_user_id = (select auth.uid()) and reply_read_at is null;
  get diagnostics replies_changed = row_count;

  update public.shared_calendar_moment_likes likes
  set read_at = now()
  from public.shared_calendar_moments moment
  where likes.moment_id = moment.id
    and moment.author_user_id = (select auth.uid())
    and likes.user_id <> (select auth.uid())
    and likes.read_at is null;
  get diagnostics likes_changed = row_count;

  changed := replies_changed + likes_changed;
  return changed;
end;
$$;

revoke all on function public.get_shared_calendar_moment_stats(bigint[]) from public, anon;
grant execute on function public.get_shared_calendar_moment_stats(bigint[]) to authenticated;
revoke all on function public.get_shared_calendar_moment_comment_preview(bigint[], integer) from public, anon;
grant execute on function public.get_shared_calendar_moment_comment_preview(bigint[], integer) to authenticated;
revoke all on function public.mark_shared_calendar_moment_notifications_read() from public, anon;
grant execute on function public.mark_shared_calendar_moment_notifications_read() to authenticated;
