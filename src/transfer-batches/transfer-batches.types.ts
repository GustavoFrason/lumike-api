/**
 * Tipos da transferência de peças em lote (prévia, histórico e romaneio).
 * Espelhados em lumike-ui/src/lib/services/transfer-batches.service.ts.
 */

/** Peça pronta para transferir (linhas da planilha já somadas por código). */
export interface TransferBatchItemPreview {
  product_id: number;
  sku: string | null;
  sku2: string | null;
  name: string;
  price: number;
  /** Quantidade pedida (soma das linhas com o mesmo código). */
  quantity: number;
  /** Quanto a origem tem desta peça agora. */
  available: number;
  /** Linhas da planilha (1 = cabeçalho); vazio no "trazer tudo". */
  row_numbers: number[];
}

/** Linha(s) da planilha que não entram na transferência, com o motivo. */
export interface TransferBatchErrorRow {
  row_numbers: number[];
  code: string;
  reason: string;
}

export interface TransferBatchPreviewResponse {
  validos: TransferBatchItemPreview[];
  erros: TransferBatchErrorRow[];
}

/** Lote no histórico. `*_user_id` / `*_name` nulos = Estoque Lumilee (Central). */
export interface TransferBatchSummary {
  id: number;
  from_user_id: number | null;
  from_name: string | null;
  to_user_id: number | null;
  to_name: string | null;
  notes: string | null;
  total_items: number;
  total_quantity: number;
  created_by_name: string | null;
  created_at: string;
}

export interface TransferBatchDetailItem {
  product_id: number;
  sku: string | null;
  sku2: string | null;
  name: string;
  /** Preço atual da peça (mesmo critério do extrato da revendedora). */
  price: number;
  quantity: number;
}

export interface TransferBatchDetail extends TransferBatchSummary {
  items: TransferBatchDetailItem[];
}
