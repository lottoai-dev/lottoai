-- Pro abonelik durumu (1.2.0).
--
-- user_entitlements: kullanicinin Pro olup olmadigi. YALNIZCA sunucu yazar:
-- RevenueCat her satin alma / yenileme / iptal / sure bitiminde
-- revenuecat-webhook Edge Function'ina bildirim gonderir, fonksiyon
-- service_role ile bu tabloyu gunceller. Kullanici yalnizca kendi satirini
-- okuyabilir; istemci kendini Pro yapamaz (kota tablosundaki ilkeyle ayni).
--
-- revenuecat_events: gelen her bildirim olay kimligiyle bir kez islenir.
-- RevenueCat ayni bildirimi yeniden gonderebilir; birincil anahtar ikinciyi
-- yutar (admob_ssv_rewards deseni).

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_pro boolean not null default false,
  -- Aboneligin bitis zamani. Iptal edilen abonelik bu tarihe kadar Pro kalir.
  expires_at timestamptz,
  product_id text,
  -- RevenueCat store degeri: APP_STORE, PLAY_STORE, PROMOTIONAL, ...
  store text,
  -- RevenueCat period_type: TRIAL, INTRO, NORMAL
  period_type text,
  -- Otomatik yenileme acik mi (kullanici iptal ettiyse false; is_pro hala true olabilir).
  will_renew boolean,
  last_event_id text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.user_entitlements is
  'Pro durumu. Yalnizca revenuecat-webhook (service_role) yazar; kullanici kendi satirini okur.';

alter table public.user_entitlements enable row level security;

drop policy if exists "user_entitlements kendi satirini okur" on public.user_entitlements;
create policy "user_entitlements kendi satirini okur"
  on public.user_entitlements
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.user_entitlements from anon, authenticated;

-- Oturumdaki kullanici su an Pro mu? Bitis tarihi gecmisse Pro sayilmaz
-- (webhook gecikse bile). Istemci ve diger SQL fonksiyonlari kullanir.
create or replace function public.is_pro()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      select e.is_pro and (e.expires_at is null or e.expires_at > now())
      from public.user_entitlements e
      where e.user_id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_pro() from public;
grant execute on function public.is_pro() to authenticated;

create table if not exists public.revenuecat_events (
  event_id text primary key,
  event_type text not null,
  app_user_id text,
  received_at timestamptz not null default now()
);

comment on table public.revenuecat_events is
  'Islenen RevenueCat bildirimleri (tekrar islememek icin). Yalnizca service_role erisir.';

alter table public.revenuecat_events enable row level security;
-- Politika yok: yalnizca service_role (RLS'i atlar) erisir.
revoke all on public.revenuecat_events from anon, authenticated;

create index if not exists revenuecat_events_received_idx
  on public.revenuecat_events (received_at desc);

-- Saklama: islenen bildirim kayitlari 180 gun sonra silinir (tekrar
-- gonderimler pratikte gunler icinde gelir). purge_old_records'un onceki
-- kurallari (20260831121500) aynen korunuyor, yalnizca son satir yeni.
create or replace function public.purge_old_records()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from notifications
   where (is_read and created_at < now() - interval '30 days')
      or created_at < now() - interval '90 days';

  delete from ai_conversations
   where created_at < now() - interval '90 days';

  delete from app_logs
   where "timestamp" < now() - interval '30 days';

  delete from revenuecat_events
   where received_at < now() - interval '180 days';
end;
$$;
