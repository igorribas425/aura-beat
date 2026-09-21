-- Private billing identity used only by server-side ASAAS checkout.
-- CPF/CNPJ must never be exposed in public profile RPCs.

create table if not exists public.billing_customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cpf_cnpj text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customer_profiles_document_check
    check (cpf_cnpj ~ '^[0-9]{11}$' or cpf_cnpj ~ '^[0-9]{14}$')
);

alter table public.billing_customer_profiles enable row level security;

revoke all on table public.billing_customer_profiles from anon, authenticated;

comment on table public.billing_customer_profiles is
  'Private billing document for server-side payment providers. Never expose through public profile queries.';

notify pgrst, 'reload schema';
