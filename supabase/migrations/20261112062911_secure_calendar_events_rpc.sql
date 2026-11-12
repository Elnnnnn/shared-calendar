revoke execute on function public.get_shared_calendar_events(date, date) from public;
revoke execute on function public.get_shared_calendar_events(date, date) from anon;
grant execute on function public.get_shared_calendar_events(date, date) to authenticated;
