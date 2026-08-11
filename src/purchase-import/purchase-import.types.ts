/**
 * Tipos do preview de importação de compra via planilha Excel (Zarpellon).
 * --------------------------------------------------
 * Campos comuns a toda linha lida da planilha, já consolidada (SKU
 * duplicado no mesmo arquivo somado) mas ainda não classificada.
 */
export interface ImportRow {
  /** Número da linha na planilha (1-indexado, igual ao Excel), pra referência no relatório. */
  row_number: number;
  /** Valor literal da célula "Produto" (coluna A) — sem normalização, nem strip nem padding de zero à esquerda. */
  sku2: string;
  /** Coluna B ("Descrição"). */
  name: string;
  /** Coluna C ("Qtd."), já somada se o mesmo sku2 apareceu mais de uma vez no arquivo. */
  quantity: number;
  /** Coluna D ("Valor Base"); se duplicado no arquivo, fica com o último valor lido. */
  unit_cost: number;
  duplicated_in_file?: boolean;
}

export interface ExistingProductRef {
  id: number;
  name: string;
  current_stock: number;
}

/** Bucket "novo produto": sku2 não bate com nenhum produto já cadastrado. */
export interface NewProductRow extends ImportRow {
  category_id: number;
  category_name: string;
  /** true quando nenhuma palavra-chave do dicionário casou e caiu na categoria padrão "A classificar". */
  category_low_confidence: boolean;
  /** unit_cost × 3, editável no preview antes de confirmar. */
  suggested_price: number;
}

/** Bucket "atualização de estoque": sku2 já existe no catálogo. */
export interface UpdateStockRow extends ImportRow {
  existing_product: ExistingProductRef;
}

/** Bucket "item não-catalogável": descrição bateu com alguma keyword de exclusão. */
export interface NonCatalogRow extends ImportRow {
  matched_keyword: string;
}

/** Bucket "erro": linha rejeitada, não entra em nenhum outro bucket. */
export interface ErrorRow {
  row_number: number;
  sku2: string;
  name: string;
  reason: string;
}

export interface ImportPreviewResponse {
  novos: NewProductRow[];
  atualizacoes: UpdateStockRow[];
  naoCatalogaveis: NonCatalogRow[];
  erros: ErrorRow[];
}
