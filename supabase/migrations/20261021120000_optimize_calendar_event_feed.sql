-- Keep the calendar feed small by accepting the visible date range and return
-- the event audience in the same authorized projection (no second table query).
drop function if exists public.get_shared_calendar_events();

create or replace function public.get_shared_calendar_events(
  p_start_date date default null,
  p_end_date date default null
)
returns table(
  id bigint,
  title text,
  event_date date,
  end_date date,
  event_time time without time zone,
  end_time time without time zone,
  all_day boolean,
  owner_email text,
  participant_emails text[],
  location text,
  note text,
  timezone text,
  can_edit boolean,
  audience_group text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with viewer as (
    select lower((select auth.jwt())->>'email') as email
    where (select auth.uid()) is not null
      and exists (
        select 1
        from public.shared_calendar_members m
        where m.email = lower((select auth.jwt())->>'email')
      )
  ),
  projected as (
    select e.*, v.email as viewer_email, visible.emails as visible_emails
    from public.shared_calendar_events e
    cross join viewer v
    cross join lateral (
      select coalesce(array_agg(person order by ordinal), '{}'::text[]) as emails
      from unnest(array_prepend(e.owner_email, e.participant_emails)) with ordinality as people(person, ordinal)
      where e.owner_email = v.email
         or v.email = any(e.participant_emails)
         or person = v.email
         or exists (
           select 1
           from public.shared_calendar_visibility permission
           where permission.viewer_email = v.email
             and permission.owner_email = person
         )
    ) visible
    where cardinality(visible.emails) > 0
      and private.can_access_shared_calendar_group(e.audience_group)
      and private.can_interact_with_shared_calendar_member(e.owner_email)
      and (p_start_date is null or coalesce(e.end_date, e.event_date) >= p_start_date)
      and (p_end_date is null or e.event_date <= p_end_date)
  )
  select
    p.id,
    p.title,
    p.event_date,
    coalesce(p.end_date, p.event_date),
    p.event_time,
    p.end_time,
    p.all_day,
    p.visible_emails[1],
    coalesce(p.visible_emails[2:cardinality(p.visible_emails)], '{}'::text[]),
    p.location,
    p.note,
    p.timezone,
    p.owner_email = p.viewer_email,
    p.audience_group
  from projected p
  order by p.event_date, p.event_time;
$function$;

grant execute on function public.get_shared_calendar_events(date, date) to authenticated;
