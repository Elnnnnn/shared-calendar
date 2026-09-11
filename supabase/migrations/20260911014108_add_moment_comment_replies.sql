alter table public.shared_calendar_moment_comments
  add column if not exists reply_to_comment_id bigint
    references public.shared_calendar_moment_comments(id) on delete set null,
  add column if not exists reply_to_event_mood_id bigint
    references public.shared_calendar_event_moods(id) on delete set null,
  add column if not exists reply_to_user_id uuid,
  add column if not exists reply_to_email text,
  add column if not exists reply_read_at timestamptz;

create index if not exists shared_calendar_moment_comments_moment_created_idx
  on public.shared_calendar_moment_comments(moment_id, created_at, id);

create index if not exists shared_calendar_moment_comments_unread_reply_idx
  on public.shared_calendar_moment_comments(reply_to_user_id, created_at desc)
  where (reply_to_comment_id is not null or reply_to_event_mood_id is not null)
    and reply_read_at is null;

create or replace function private.set_shared_calendar_comment_reply_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_email text;
begin
  if new.reply_to_comment_id is null and new.reply_to_event_mood_id is null then
    new.reply_to_user_id := null;
    new.reply_to_email := null;
    new.reply_read_at := null;
    return new;
  end if;

  if new.reply_to_comment_id is not null and new.reply_to_event_mood_id is not null then
    raise exception 'A reply can only have one target';
  end if;

  if new.reply_to_comment_id is not null then
    select author_user_id, author_email
      into target_user_id, target_email
    from public.shared_calendar_moment_comments
    where id = new.reply_to_comment_id
      and moment_id = new.moment_id;
  else
    select mood.author_user_id, mood.author_email
      into target_user_id, target_email
    from public.shared_calendar_event_moods mood
    join public.shared_calendar_moments moment
      on moment.id = new.moment_id and moment.event_id = mood.event_id
    where mood.id = new.reply_to_event_mood_id;
  end if;

  if not found then
    raise exception 'Reply target is not part of this moment';
  end if;

  new.reply_to_user_id := target_user_id;
  new.reply_to_email := target_email;
  new.reply_read_at := case
    when target_user_id = new.author_user_id then now()
    else null
  end;
  return new;
end;
$$;

revoke all on function private.set_shared_calendar_comment_reply_target() from public;
revoke all on function private.set_shared_calendar_comment_reply_target() from anon;
revoke all on function private.set_shared_calendar_comment_reply_target() from authenticated;

drop trigger if exists set_shared_calendar_comment_reply_target
on public.shared_calendar_moment_comments;
create trigger set_shared_calendar_comment_reply_target
before insert or update of reply_to_comment_id, reply_to_event_mood_id
on public.shared_calendar_moment_comments
for each row execute function private.set_shared_calendar_comment_reply_target();

create or replace function public.mark_shared_calendar_replies_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.shared_calendar_moment_comments
  set reply_read_at = now()
  where reply_to_user_id = (select auth.uid())
    and (reply_to_comment_id is not null or reply_to_event_mood_id is not null)
    and reply_read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_shared_calendar_replies_read() from public;
revoke all on function public.mark_shared_calendar_replies_read() from anon;
grant execute on function public.mark_shared_calendar_replies_read() to authenticated;
