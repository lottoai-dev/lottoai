-- AdMob sunucu tarafli odul dogrulamasi (SSV) icin altyapi.
--
-- 1) admob_ssv_rewards: Google'in gonderdigi her odul bildirimi transaction_id
--    ile bir kez islenir. Google ayni bildirimi yeniden gonderebilir (retry);
--    birincil anahtar sayesinde ikinci deneme sessizce yutulur.
-- 2) feature_usage_daily uzerindeki trigger: kotayi yalnizca service_role
--    azaltabilir. Boylece istemci increment_feature_usage'i negatif miktarla
--    cagirip kendine bedava hak yazamaz.

create table if not exists public.admob_ssv_rewards (
  transaction_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  reward_amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.admob_ssv_rewards enable row level security;
-- Politika yok: yalnizca service_role (RLS'i atlar) erisir.

create index if not exists admob_ssv_rewards_user_created_idx
  on public.admob_ssv_rewards (user_id, created_at desc);

create or replace function public.guard_feature_usage_decrease()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.role(), security definer fonksiyonlarin icinde de istegin JWT'sini
  -- yansitir; bu yuzden increment_feature_usage uzerinden gelen cagrilar da
  -- burada dogru sekilde ayirt edilir.
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.filtered_coupon_count < old.filtered_coupon_count
       or new.report_count < old.report_count then
      raise exception 'Kota yalnizca sunucu tarafindan azaltilabilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_feature_usage_decrease on public.feature_usage_daily;
create trigger guard_feature_usage_decrease
  before update on public.feature_usage_daily
  for each row
  execute function public.guard_feature_usage_decrease();
