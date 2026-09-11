create index if not exists shared_calendar_moment_comments_reply_comment_idx
  on public.shared_calendar_moment_comments(reply_to_comment_id)
  where reply_to_comment_id is not null;

create index if not exists shared_calendar_moment_comments_reply_mood_idx
  on public.shared_calendar_moment_comments(reply_to_event_mood_id)
  where reply_to_event_mood_id is not null;
