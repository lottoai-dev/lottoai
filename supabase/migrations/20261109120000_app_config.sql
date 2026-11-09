-- app_config: uygulamanin sunucudan okudugu ayarlar (Pro, 1.2.0).
--
-- Ilk ayar: ucretsiz gunluk haklar. Uygulama sinirini bundan sonra koddan
-- degil buradan okur; boylece sinir yeni magaza surumu cikarmadan
-- degistirilebilir (projede OTA guncelleme yok).
--
-- Herkes okuyabilir (giris yapmamis kullanici dahil); yalnizca service_role
-- (panel / sunucu) yazabilir. 1.2.0 oncesi surumler bu tabloyu okumaz,
-- sinirlari kodda sabit kalir.

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Uygulamanin sunucudan okudugu ayarlar. Herkes okur, yalnizca service_role yazar.';

alter table public.app_config enable row level security;

drop policy if exists "app_config herkes okur" on public.app_config;
create policy "app_config herkes okur"
  on public.app_config
  for select
  to anon, authenticated
  using (true);

-- Yazma politikasi bilincli olarak yok; ek guvence olarak yetkiler de kapali.
revoke insert, update, delete on public.app_config from anon, authenticated;

-- Ucretsiz kullanici icin ozellik basina gunluk hak (Pro'da sinirsiz).
-- Anahtarlar lib/featureQuota.ts icindeki FeatureKey ile ayni.
insert into public.app_config (key, value)
values ('feature_daily_limits', '{"filtered_coupon": 5, "report": 5, "lota": 5}'::jsonb)
on conflict (key) do nothing;
