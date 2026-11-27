create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "본인 프로필만 조회" on public.profiles
  for select using (auth.uid() = id);

create policy "본인 프로필만 수정" on public.profiles
  for update using (auth.uid() = id);
