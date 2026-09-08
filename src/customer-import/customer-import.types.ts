/**
 * Tipos do preview de importação de clientes via planilha Excel.
 * --------------------------------------------------
 * Espelha o padrão de `purchase-import.types.ts`: cada linha lida da
 * planilha, já consolidada (mesma pessoa repetida no arquivo unificada)
 * mas ainda não classificada. Nada é persistido no preview.
 */
export interface CustomerImportRow {
  /** Número da linha na planilha (1-indexado, igual ao Excel). */
  row_number: number;
  /** Coluna A ("Nome"). Único campo obrigatório. */
  name: string;
  /** Coluna B ("Email"), já normalizado (trim + lowercase) ou ''. */
  email: string;
  /** Coluna C ("Telefone"), como digitado (trim) ou ''. */
  phone: string;
  /** Coluna D ("CPF"), como digitado (trim) ou ''. */
  cpf: string;
  /** Coluna E ("CEP"). */
  zipcode: string;
  /** Coluna F ("Endereço"). */
  address: string;
  /** Coluna G ("Cidade"). */
  city: string;
  /** Coluna H ("Estado"), UF em maiúsculas. */
  state: string;
  /** Coluna I ("Observações"). */
  notes: string;
  /** true quando a mesma pessoa apareceu mais de uma vez no arquivo. */
  duplicated_in_file?: boolean;
}

export interface ExistingCustomerRef {
  id: number;
  name: string;
  /** Por qual campo a linha da planilha bateu com o cliente já cadastrado. */
  matched_by: 'email' | 'cpf' | 'phone';
}

/** Bucket "novo": não bateu com nenhum cliente já cadastrado. Vai ser criado. */
export type NewCustomerRow = CustomerImportRow;

/** Bucket "já cadastrado": bateu com um cliente existente. É ignorado na importação. */
export interface DuplicateCustomerRow extends CustomerImportRow {
  existing_customer: ExistingCustomerRef;
}

/** Bucket "erro": linha rejeitada (sem nome, e-mail/CPF inválido). */
export interface CustomerErrorRow {
  row_number: number;
  name: string;
  reason: string;
}

export interface CustomerImportPreviewResponse {
  novos: NewCustomerRow[];
  jaCadastrados: DuplicateCustomerRow[];
  erros: CustomerErrorRow[];
}

export interface ConfirmCustomerImportResult {
  created: number;
  /** Linhas que, no momento do confirm, já existiam no banco (ignoradas). */
  skipped: number;
}
