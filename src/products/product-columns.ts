/**
 * Colunas de `products` que podem ser expostas a visitantes e clientes
 * (vitrine, página de produto, favoritos).
 *
 * Fica de fora tudo que é dado interno de gestão: `cost_price` (custo),
 * `sku2` (código do fornecedor), `supplier_id`, `min_stock`,
 * `purchase_date` e `updated_at`. Staff continua recebendo `*`.
 */
export const PUBLIC_PRODUCT_COLUMNS =
  'id, sku, name, slug, description, short_description, price, preco_promocional, current_stock, category_id, colecao_id, collection, is_active, is_featured, created_at' as const;

/** Joins usados pelos cards/página de produto. */
export const PRODUCT_RELATIONS =
  'categories:category_id (id, name, slug), images:imagens_produto (url, ordem)' as const;

export const PUBLIC_PRODUCT_SELECT =
  `${PUBLIC_PRODUCT_COLUMNS}, ${PRODUCT_RELATIONS}` as const;

export const STAFF_PRODUCT_SELECT = `*, ${PRODUCT_RELATIONS}` as const;

/** Teto de itens por página na listagem pública (evita dump do catálogo). */
export const PUBLIC_PRODUCTS_MAX_LIMIT = 100;
