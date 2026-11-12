begin;

create or replace function public.set_shared_calendar_member_color(p_color text)
returns table(email text, color text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from private.shared_calendar_access access
       where lower(access.email) = v_email
     ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if (
    v_email = 'frankyelf1997@outlook.com'
    and p_color not in ('stone', 'mist', 'sea')
  ) or (
    v_email <> 'frankyelf1997@outlook.com'
    and p_color not in ('sage', 'rose', 'gold', 'clay', 'lavender', 'peach', 'moss')
  ) then
    raise exception 'Color is not available for this account' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.shared_calendar_members member
    where member.color = p_color
      and lower(member.email) <> v_email
  ) then
    raise exception 'Color is already in use' using errcode = '23505';
  end if;

  update public.shared_calendar_members member
  set color = p_color
  where lower(member.email) = v_email;

  if not found then
    raise exception 'Member record not found' using errcode = 'P0002';
  end if;

  return query
  select member.email, member.color
  from public.shared_calendar_members member
  where lower(member.email) = v_email;
end;
$$;

drop policy if exists "members view scoped expense periods"
  on public.shared_calendar_expense_periods;

create policy "members view scoped expense periods"
on public.shared_calendar_expense_periods
for select
to authenticated
using (
  (select private.is_shared_calendar_member())
  and (
    owner_user_id = (select auth.uid())
    or (select private.can_access_shared_calendar_expense_period(id))
  )
);

revoke execute on function public.get_shared_calendar_events(date, date) from anon;

commit;
