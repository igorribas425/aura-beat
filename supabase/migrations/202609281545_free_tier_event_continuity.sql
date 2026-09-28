-- 2026-09-28
-- Mantém a gestão de eventos disponível no plano Gratuito da Casa.
-- A criação de novas ofertas continua exclusiva dos planos pagos.

update public.plans
set benefits = jsonb_set(benefits, '{events}', 'true'::jsonb, true)
where audience='venue'
  and code='free';

notify pgrst,'reload schema';
