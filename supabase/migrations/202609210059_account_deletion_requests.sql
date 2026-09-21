create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  email_snapshot text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz null,
  resolution_note text null
);

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from anon, authenticated;

create unique index if not exists account_deletion_requests_open_uidx
  on public.account_deletion_requests (user_id)
  where user_id is not null and status in ('pending', 'processing');

comment on table public.account_deletion_requests is
  'Private queue for authenticated account deletion requests.';
