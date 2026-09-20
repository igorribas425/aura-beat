-- Corrige compatibilidade da Central de Notificações.
-- Migration pequena e segura: não recria a tabela e não altera notificações existentes.

alter table public.notifications
  add column if not exists link_url text;
