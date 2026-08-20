-- Günlük AI token kullanım takibi.
-- ai-chat Edge Function'ı her başarılı DeepSeek çağrısından sonra
-- increment_ai_usage ile kullanılan token'ı yazar; istek öncesi bu tablodan
-- günlük toplamı okuyup kotayı (şu an 100.000 token/gün) uygular.

create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  tokens_used bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_usage_daily enable row level security;

-- Kullanıcı kendi kullanımını okuyabilir (ileride "kalan hak" göstergesi için).
-- Yazma yalnızca service role üzerinden (Edge Function) yapılır.
create policy "Users can read own AI usage"
  on public.ai_usage_daily
  for select
  using (auth.uid() = user_id);

-- Atomik artırma: aynı güne paralel istekler kaybolmadan toplanır.
create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_day date,
  p_tokens bigint
) returns bigint
language sql
security definer
set search_path = public
as $$
  insert into ai_usage_daily (user_id, day, tokens_used)
  values (p_user_id, p_day, p_tokens)
  on conflict (user_id, day)
  do update set
    tokens_used = ai_usage_daily.tokens_used + excluded.tokens_used,
    updated_at = now()
  returning tokens_used;
$$;

-- Sadece service role çağırabilsin; istemciler kendi kotasını artıramaz/kandıramaz.
revoke all on function public.increment_ai_usage(uuid, date, bigint) from public, anon, authenticated;
