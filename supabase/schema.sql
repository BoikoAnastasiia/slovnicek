create table public.words (
  id uuid primary key,
  user_id uuid not null references auth.users (id) default auth.uid(),
  slovak text not null default '',
  translation_ru text not null default '',
  definition_sk text not null default '',
  part_of_speech text not null default '',
  gender text not null default '',
  examples jsonb not null default '[]',
  tags jsonb not null default '[]',
  notes text not null default '',
  fsrs jsonb not null default '{}',
  due timestamptz,
  prompt_mode text not null default 'auto',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.review_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) default auth.uid(),
  word_id uuid not null,
  question_type text not null,
  correct boolean not null,
  fsrs_grade int not null,
  points_earned int not null,
  answered_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.profile (
  id text not null,
  user_id uuid not null references auth.users (id) default auth.uid(),
  total_points int not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  last_round_date text,
  achievements jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table public.words enable row level security;
alter table public.review_logs enable row level security;
alter table public.profile enable row level security;

create policy "own rows" on public.words for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.review_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index words_user_updated on public.words (user_id, updated_at);
create index review_logs_user_updated on public.review_logs (user_id, updated_at);
