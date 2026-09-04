-- Lota AI gunluk kota: feature_usage_daily.lota_count
-- Filtreli kolon ve rapor ile ayni FREE_DAILY_LIMIT / odul modelini kullanir.

alter table public.feature_usage_daily
  add column if not exists lota_count integer not null default 0;

create or replace function public.guard_feature_usage_decrease()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.filtered_coupon_count < old.filtered_coupon_count
       or new.report_count < old.report_count
       or new.lota_count < old.lota_count then
      raise exception 'Kota yalnizca sunucu tarafindan azaltilabilir';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.increment_feature_usage(
  p_user_id uuid,
  p_day date,
  p_field text,
  p_amount integer default 1
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_value int;
begin
  if p_user_id is null then
    raise exception 'missing user';
  end if;

  if p_user_id is distinct from auth.uid()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'unauthorized user';
  end if;

  if p_amount not in (1, -3) then
    raise exception 'invalid amount';
  end if;

  if p_field not in ('filtered_coupon_count', 'report_count', 'lota_count') then
    raise exception 'invalid field: %', p_field;
  end if;

  insert into feature_usage_daily (user_id, day, filtered_coupon_count, report_count, lota_count)
  values (
    p_user_id,
    p_day,
    case when p_field = 'filtered_coupon_count' then p_amount else 0 end,
    case when p_field = 'report_count' then p_amount else 0 end,
    case when p_field = 'lota_count' then p_amount else 0 end
  )
  on conflict (user_id, day) do update
  set
    filtered_coupon_count = feature_usage_daily.filtered_coupon_count
      + case when p_field = 'filtered_coupon_count' then p_amount else 0 end,
    report_count = feature_usage_daily.report_count
      + case when p_field = 'report_count' then p_amount else 0 end,
    lota_count = feature_usage_daily.lota_count
      + case when p_field = 'lota_count' then p_amount else 0 end,
    updated_at = now()
  returning
    case
      when p_field = 'filtered_coupon_count' then filtered_coupon_count
      when p_field = 'report_count' then report_count
      else lota_count
    end
  into new_value;

  if new_value < -15 then
    raise exception 'daily reward limit exceeded';
  end if;

  return new_value;
end;
$$;
