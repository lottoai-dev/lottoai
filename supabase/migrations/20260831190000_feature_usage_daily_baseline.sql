-- feature_usage_daily: gunluk, kullanici bazli ozellik kotasi.
--
-- BASELINE: Bu tablo ilk olarak Supabase panelinden olusturulmustu ve
-- migration'larda yoktu. Bu dosya canli tanimi (9 Kas 2026 itibariyla)
-- kayda gecirir; tarihi, tabloyu degistiren ilk migration'dan
-- (20260831193000_admob_ssv_rewards) once olacak sekilde secildi.
--
-- Canli veritabaninda CALISTIRILMAZ: orada tablo zaten var. Canliya
-- yeni migration'lari gondermeden once bu surum "uygulandi" olarak
-- isaretlenir:
--   npx supabase migration repair --status applied 20260831190000
-- Yine de her ifade idempotent yazildi; yanlislikla calissa da degisiklik
-- yapmaz.
--
-- Yazma: istemci dogrudan yazamaz (yalnizca okuma politikasi var); sayac
-- increment_feature_usage RPC'si (security definer) ile artar, azaltmayi
-- guard_feature_usage_decrease trigger'i service_role'e sinirlar.

create table if not exists public.feature_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  filtered_coupon_count integer not null default 0,
  report_count integer not null default 0,
  updated_at timestamptz not null default now(),
  lota_count integer not null default 0,
  constraint feature_usage_daily_pkey primary key (user_id, day)
);

alter table public.feature_usage_daily enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_usage_daily'
      and policyname = 'Users can read own feature usage'
  ) then
    create policy "Users can read own feature usage"
      on public.feature_usage_daily
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
