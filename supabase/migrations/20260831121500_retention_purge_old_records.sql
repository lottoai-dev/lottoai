-- Sınırsız büyüyen tablolar için saklama süresi.
-- notifications / ai_conversations / app_logs hiç temizlenmiyordu; app_logs
-- için ayrı bir cron işi (app_logs_retention_daily) vardı, kurallar tek
-- fonksiyonda toplandı.

create or replace function public.purge_old_records()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Okunmuş bildirimler 30, okunmamışlar 90 gün sonra silinir. Okunmamışı
  -- daha uzun tutuyoruz: uygulamayı seyrek açan kullanıcı bildirimini
  -- kaçırmasın.
  delete from notifications
   where (is_read and created_at < now() - interval '30 days')
      or created_at < now() - interval '90 days';

  -- Sadece AI cevap kalitesini incelemek için tutulur, istemci hiç okumaz.
  delete from ai_conversations
   where created_at < now() - interval '90 days';

  delete from app_logs
   where "timestamp" < now() - interval '30 days';
end;
$$;

-- Eski, yalnızca app_logs'u temizleyen iş artık gereksiz.
do $$
begin
  perform cron.unschedule('app_logs_retention_daily');
exception
  when others then null;
end $$;

-- Her gece 03:30 UTC (TR saatiyle 06:30) — trafiğin en düşük olduğu saat.
do $$
begin
  perform cron.schedule(
    'purge-old-records',
    '30 3 * * *',
    $job$select public.purge_old_records()$job$
  );
exception
  when others then null;
end $$;
