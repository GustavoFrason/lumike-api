# SQL legado — não rode

Scripts do início do projeto, aplicados à mão no banco antes de existirem as migrations versionadas em `../migrations`. Ficam aqui só como referência histórica.

**Não aplique nenhum deles.** Vários contradizem o modelo atual:

- `migration_leads.sql` cria uma policy de INSERT em `leads` aberta a qualquer um, inclusive `anon`, que hoje não tem acesso a nada em `public`;
- `migration_flatten_products.sql` faz `TRUNCATE` em produtos e itens de pedido;
- `COMPLETE_SCHEMA.sql` (snapshot de nov/2025) recria os triggers de estoque em `order_items`, o que desconta o estoque duas vezes por venda, e cria o admin `admin@lumike.com` com um hash de senha fixo.

Para mudar o schema, crie uma migration nova em `../migrations` seguindo o `../migrations/README.md`.
