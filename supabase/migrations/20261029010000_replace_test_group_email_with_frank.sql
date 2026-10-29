-- Replace the retired tester login in the shared-calendar group boundary.
-- Frank Y belongs to the friends group; besties membership remains unchanged.

create or replace function private.can_access_shared_calendar_group(p_group text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_group is null then true
    when p_group = 'besties' then
      lower(coalesce((select auth.jwt())->>'email', '')) = any(array[
        'elainezhang1110@gmail.com',
        'zxu1115@icloud.com',
        '1914660774@qq.com',
        'mqianw00@163.com'
      ])
    when p_group = 'friends' then
      lower(coalesce((select auth.jwt())->>'email', '')) = any(array[
        'elainezhang1110@gmail.com',
        'frankyelf1997@outlook.com'
      ])
    when p_group = 'both' then
      lower(coalesce((select auth.jwt())->>'email', '')) = any(array[
        'elainezhang1110@gmail.com',
        'zxu1115@icloud.com',
        '1914660774@qq.com',
        'mqianw00@163.com',
        'frankyelf1997@outlook.com'
      ])
    else false
  end;
$function$;

create or replace function private.can_assign_shared_calendar_group(p_group text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_group is null then true
    when lower(coalesce((select auth.jwt())->>'email', '')) = 'elainezhang1110@gmail.com'
      then p_group in ('besties', 'friends', 'both')
    when lower(coalesce((select auth.jwt())->>'email', '')) = 'frankyelf1997@outlook.com'
      then p_group = 'friends'
    else p_group = 'besties'
  end;
$function$;
