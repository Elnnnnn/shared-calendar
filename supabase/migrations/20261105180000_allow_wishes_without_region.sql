begin;

alter table public.shared_calendar_wishes
  drop constraint if exists shared_calendar_wishes_region_check;

alter table public.shared_calendar_wishes
  add constraint shared_calendar_wishes_region_check
  check (char_length(btrim(region)) <= 80);

commit;
