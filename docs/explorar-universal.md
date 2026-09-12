# Explorar universal

`/buscar` é a rota única de descoberta do Aura Beat. Ela atende os modos Artista e Casa, reúne os dois tipos de perfil e oferece visualizações em lista e mapa.

## Dependência de banco

Aplicar `supabase/migrations/202609120002_universal_explore.sql` em staging antes de publicar a aplicação. A migration não foi aplicada automaticamente em nenhum projeto remoto.

Ela adiciona:

- preferências públicas de contratação do Artista (`accepted_event_types` e `availability_radius_km`);
- tipo e imagem pública da Casa;
- `public_profile_locations`, com leitura direta restrita ao proprietário;
- `set_public_profile_location_v1`, para o proprietário manter a própria localização pública;
- `explore_profiles_v1`, RPC paginada que agrega perfis, estilos, avaliações e disponibilidade.

Enquanto a migration não estiver aplicada, o Explorar usa consultas limitadas aos campos já existentes e mantém a lista funcional. O mapa não tenta obter coordenadas privadas como fallback.

## Contrato de privacidade

- O Explorar nunca consulta `booking_tracking`.
- A posição do navegador usada para distância fica apenas no estado da sessão e não é persistida pela página.
- Coordenadas de Artista retornadas pela RPC são reduzidas para uma grade de no mínimo 5 km.
- O GPS de `artist_availability` só pode alimentar o ponto aproximado enquanto houver consentimento, status disponível e atualização nos últimos 30 minutos.
- Telefone, e-mail, documentos, CNPJ, endereço detalhado e dados financeiros não fazem parte da RPC nem dos perfis públicos.

## Checklist manual

- [ ] Artista: abrir Todos, Artistas e Casas em lista e mapa.
- [ ] Casa: abrir Todos, Artistas e Casas em lista e mapa.
- [ ] Conta dupla: alternar o modo e confirmar que Enviar oferta aparece apenas no modo Casa.
- [ ] Favoritar e desfavoritar Artista e Casa.
- [ ] Abrir os perfis públicos de Artista e Casa.
- [ ] Validar busca por nome e filtros de cidade, estilo, evento, disponibilidade, verificação, avaliação e cachê/hora.
- [ ] Permitir localização e validar marcador próprio e filtro de distância.
- [ ] Negar localização e confirmar que a lista continua funcional.
- [ ] Conferir placeholders para perfil sem foto e ausência de marcador para perfil sem coordenadas.
- [ ] Ativar e desativar a disponibilidade de Artista e validar destaque sem exposição do GPS exato.
- [ ] Repetir em viewport mobile e desktop.
