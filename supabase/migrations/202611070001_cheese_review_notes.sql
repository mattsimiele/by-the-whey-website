begin;
-- Internal review notes stay separate from publicly readable cheese records.
create table public.cheese_review_notes (
  cheese_id uuid primary key references public.cheeses(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 4000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.cheese_review_notes enable row level security;
revoke all on public.cheese_review_notes from anon;
grant select, insert, update on public.cheese_review_notes to authenticated;
create policy "active admins manage cheese review notes"
  on public.cheese_review_notes for all to authenticated
  using (public.is_admin() and exists (
    select 1 from public.profiles where id = auth.uid() and account_status in ('active', 'warned')
  ))
  with check (public.is_admin() and exists (
    select 1 from public.profiles where id = auth.uid() and account_status in ('active', 'warned')
  ));
create function public.stamp_cheese_review_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger stamp_cheese_review_note
  before insert or update on public.cheese_review_notes
  for each row execute function public.stamp_cheese_review_note();

commit;
