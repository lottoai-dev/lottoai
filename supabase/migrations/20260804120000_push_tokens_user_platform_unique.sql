-- push_tokens: aynı kullanıcı + platform için tek satır garantisi.
-- Eski istemci onConflict: 'token' kullanıyordu; Expo/FCM token yenilenince
-- yeni satır birikiyordu (gerçek kullanıcıda 42 satır, tekrarlayan bildirimler).

-- user_id yoksa ekle (eski şemalar için).
alter table public.push_tokens
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 1) Aynı user_id + platform için en güncel satır dışındakileri sil.
delete from public.push_tokens
where ctid in (
  select ctid
  from (
    select
      ctid,
      row_number() over (
        partition by user_id, platform
        order by updated_at desc nulls last, ctid desc
      ) as rn
    from public.push_tokens
    where user_id is not null
  ) ranked
  where rn > 1
);

-- 2) user_id'siz (eski/anonim) satırlar artık kullanılmıyor — temizle.
--    İstemci yalnızca giriş yapmış kullanıcı için yazar.
delete from public.push_tokens
where user_id is null;

-- 3) Benzersizlik kısıtı (yoksa ekle).
do $$
begin
  alter table public.push_tokens
    add constraint push_tokens_user_platform_unique unique (user_id, platform);
exception
  when duplicate_object then null;
end $$;
