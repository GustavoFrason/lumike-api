# lumike-api

API da Lumilee Semijoias: NestJS 11 + Supabase (Postgres).

O login é próprio: a API emite o JWT e não usa Supabase Auth. Todo acesso ao banco passa por aqui, com a chave `service_role`. As roles `anon` e `authenticated` do Supabase não acessam nada.

## Rodando

```bash
npm install
npm run start:dev   # http://localhost:3001
```

Variáveis em `.env`:

| Variável                | Para quê                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`          | URL do projeto Supabase                                                                     |
| `SUPABASE_SERVICE_ROLE` | chave `service_role` (nunca vai para o navegador)                                           |
| `JWT_SECRET`            | assina os tokens de login                                                                   |
| `PORT`                  | porta; padrão `3001`                                                                        |
| `ALLOWED_ORIGINS`       | origens do CORS separadas por vírgula; padrão `http://localhost:3000,http://localhost:3001` |
| `TRUST_PROXY`           | `1` atrás de um proxy (Railway), para `req.ip` ser o IP real                                |
| `INTERNAL_PROXY_SECRET` | mesmo valor da UI; permite usar o IP do cliente que a UI repassa no rate limit              |

Comandos: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Banco

As migrations ficam em `supabase/migrations`. Leia o `supabase/migrations/README.md` antes de aplicar qualquer uma: em produção elas são aplicadas pelo SQL Editor, nunca com `supabase db push`. O SQL antigo fica em `supabase/legacy` e não deve ser rodado.

O guia completo, com API e UI, está no `SETUP.md` do monorepo `lumike`.
