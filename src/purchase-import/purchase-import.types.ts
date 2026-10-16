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
  /**
   * Coluna E ("Valor de Venda"), opcional. `NaN` quando a célula está vazia
   * ou não é um número válido — nesse caso `suggested_price` (NewProductRow)
   * cai na regra padrão (unit_cost × 3) em vez de usar este valor. Ver
   * computeSuggestedPrice no service.
   */
  sale_price: number;
  duplicated_in_file?: boolean;
  /**
   * Peças por kit (kit = N peças iguais vendidas soltas). 1 = produto comum.
   * Sugerido pela descrição ("KIT 12 BRINCOS" → 12) e editável no preview;
   * quantidade, custo e preço da linha continuam POR UNIDADE COMPRADA (kit)
   * — quem converte pra peças é o confirm (ver kit-conversion.util).
   */
  pieces_per_kit: number;
  /** true quando pieces_per_kit veio da descrição (destacar pra conferência). */
  pieces_per_kit_suggested: boolean;
}

export interface ExistingProductRef {
  id: number;
  name: string;
  current_stock: number;
  /** Preço atual (por peça) — pra conferir se não ficou preço de kit. */
  price: number;
  sku2: string | null;
  sku2_alt: string | null;
  /**
   * Fornecedor cadastrado no produto. A tela avisa quando é diferente do
   * fornecedor escolhido para a importação (código igual de outro
   * fornecedor não pode somar estoque na peça errada).
   */
  supplier_id: number | null;
  /** Por qual código o produto foi reconhecido. */
  matched_by: 'sku2' | 'sku2_alt';
  /** Quantos produtos têm esse código (>1 = duplicata no catálogo). */
  match_count: number;
}

/** Bucket "novo produto": sku2 não bate com nenhum produto já cadastrado. */
export interface NewProductRow extends ImportRow {
  category_id: number;
  category_name: string;
  /** true quando nenhuma palavra-chave do dicionário casou e caiu na categoria padrão "A classificar". */
  category_low_confidence: boolean;
  /**
   * sale_price (coluna "Valor de Venda") quando preenchido na planilha,
   * senão unit_cost × 3 — editável no preview antes de confirmar (ver
   * ConfirmImportItemDto.price, que é o que de fato persiste esse valor).
   * POR UNIDADE COMPRADA: num kit é o preço do kit inteiro; o confirm
   * divide pelas peças.
   */
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
