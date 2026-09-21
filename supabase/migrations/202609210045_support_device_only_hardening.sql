-- 2026-09-21
-- Remove caminhos antigos de cadastro da Equipe Aura que nao registram dispositivo.

revoke execute on function public.support_accept_invite_v1(text)
from authenticated;

revoke execute on function public.owner_support_team_add_v1(text)
from authenticated;

notify pgrst,'reload schema';
