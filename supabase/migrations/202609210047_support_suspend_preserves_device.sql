-- Suspending a support agent blocks access without forgetting the trusted device.
-- Explicit device reset, device transfer, role removal and role change still revoke it.
create or replace function public.revoke_support_device_on_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    if old.role='support' then
      update public.support_agent_devices
      set revoked_at=coalesce(revoked_at,now())
      where user_id=old.user_id;
    end if;
    return old;
  end if;

  if old.role='support'
     and new.role<>'support' then
    update public.support_agent_devices
    set revoked_at=coalesce(revoked_at,now())
    where user_id=old.user_id;
  end if;

  return new;
end;
$$;
