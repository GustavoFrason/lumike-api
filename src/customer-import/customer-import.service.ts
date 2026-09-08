import {
  BadRequestException,
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import * as XLSX from 'xlsx';
import { ConfirmCustomerImportDto } from './dto/confirm-customer-import.dto';
import {
  ConfirmCustomerImportResult,
  CustomerErrorRow,
  CustomerImportPreviewResponse,
  CustomerImportRow,
  DuplicateCustomerRow,
  ExistingCustomerRef,
  NewCustomerRow,
} from './customer-import.types';

/** Célula crua de planilha: o que o `xlsx` pode devolver por célula. */
type SheetCell = string | number | boolean | Date | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Só os dígitos de uma string (pra comparar CPF/telefone sem máscara). */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

interface MatchKeys {
  email: string;
  cpf: string;
  phone: string;
}

interface ExistingCustomerIndex {
  byEmail: Map<string, ExistingCustomerRef>;
  byCpf: Map<string, ExistingCustomerRef>;
  byPhone: Map<string, ExistingCustomerRef>;
}

/** Linha pronta pra gravar em `customers` (nulls no lugar de string vazia). */
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];

@Injectable()
export class CustomerImportService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Lê a planilha, classifica cada linha e devolve os 3 buckets do preview
   * — nada é persistido ainda, tudo fica editável no frontend até o
   * `confirm`.
   */
  async buildPreview(
    fileBuffer: Buffer,
  ): Promise<CustomerImportPreviewResponse> {
    const parsed = this.parseWorkbook(fileBuffer);
    const consolidated = this.consolidateDuplicates(parsed);

    const erros: CustomerErrorRow[] = [];
    const validRows: CustomerImportRow[] = [];
    for (const row of consolidated) {
      const reason = this.validateRow(row);
      if (reason) {
        erros.push({ row_number: row.row_number, name: row.name, reason });
        continue;
      }
      validRows.push(row);
    }

    const index = await this.loadExistingCustomerIndex();

    const novos: NewCustomerRow[] = [];
    const jaCadastrados: DuplicateCustomerRow[] = [];
    for (const row of validRows) {
      const existing = this.lookupExisting(this.matchKeysFor(row), index);
      if (existing) {
        jaCadastrados.push({ ...row, existing_customer: existing });
      } else {
        novos.push(row);
      }
    }

    return { novos, jaCadastrados, erros };
  }

  /**
   * Persiste os clientes já revisados/aprovados pelo usuário (só o bucket
   * "novos"). Um `INSERT` em lote é uma statement atômica no Postgres —
   * `customers` não tem trigger nem cascata, então não precisa de função
   * plpgsql como a importação de compra.
   */
  async confirm(
    dto: ConfirmCustomerImportDto,
  ): Promise<ConfirmCustomerImportResult> {
    for (const item of dto.items) {
      if (!item.name || !item.name.trim()) {
        throw new BadRequestException(
          'Nome é obrigatório em todos os itens da importação',
        );
      }
    }

    const rows = dto.items.map((item) => this.toCustomerInsert(item));

    // Re-checa contra o banco: alguém pode ter cadastrado um desses clientes
    // entre o preview e o confirm.
    const index = await this.loadExistingCustomerIndex();
    const toInsert = rows.filter(
      (row) => !this.lookupExisting(this.matchKeysForInsert(row), index),
    );
    let skipped = rows.length - toInsert.length;

    if (toInsert.length === 0) {
      return { created: 0, skipped };
    }

    const { error } = await this.supabase.from('customers').insert(toInsert);
    if (!error) {
      return { created: toInsert.length, skipped };
    }

    // 23505 = unique_violation (índice uix_customers_email em lower(email)).
    // Acontece se um e-mail escapou da re-checagem por divergência de caixa
    // ou corrida. Reinsere linha a linha pra isolar as boas.
    if (error.code === '23505') {
      let created = 0;
      for (const row of toInsert) {
        const { error: rowError } = await this.supabase
          .from('customers')
          .insert(row);
        if (!rowError) {
          created += 1;
        } else if (rowError.code === '23505') {
          skipped += 1;
        } else {
          throw new InternalServerErrorException(
            `Erro ao importar clientes: ${rowError.message}`,
          );
        }
      }
      return { created, skipped };
    }

    throw new InternalServerErrorException(
      `Erro ao importar clientes: ${error.message}`,
    );
  }

  // --------------------------------------------------------------------
  // Parsing
  // --------------------------------------------------------------------

  /**
   * Layout fixo do modelo (public/modelos/modelo-importacao-clientes.xlsx):
   * linha 1 = cabeçalho (sempre ignorada), dados a partir da linha 2, lidos
   * por posição de coluna A→I. Colunas E+ além da I são ignoradas (é onde o
   * modelo põe as instruções de preenchimento).
   */
  private parseWorkbook(fileBuffer: Buffer): CustomerImportRow[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: SheetCell[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
    });

    const rows: CustomerImportRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const [
        nameCell,
        emailCell,
        phoneCell,
        cpfCell,
        cepCell,
        addressCell,
        cityCell,
        stateCell,
        notesCell,
      ] = row;

      const parsed: CustomerImportRow = {
        row_number: i + 1,
        name: this.readCell(nameCell),
        email: this.readCell(emailCell).toLowerCase(),
        phone: this.readCell(phoneCell),
        cpf: this.readCell(cpfCell),
        zipcode: this.readCell(cepCell),
        address: this.readCell(addressCell),
        city: this.readCell(cityCell),
        state: this.readCell(stateCell).toUpperCase(),
        notes: this.readCell(notesCell),
      };

      const isEmpty =
        !parsed.name &&
        !parsed.email &&
        !parsed.phone &&
        !parsed.cpf &&
        !parsed.zipcode &&
        !parsed.address &&
        !parsed.city &&
        !parsed.state &&
        !parsed.notes;
      if (isEmpty) continue; // linha totalmente vazia, não é erro

      rows.push(parsed);
    }

    return rows;
  }

  private readCell(cell: SheetCell): string {
    if (cell === undefined || cell === null) return '';
    return String(cell).trim();
  }

  /** Chave de identidade da linha: email, senão CPF, senão telefone (normalizados). */
  private matchKeysFor(row: CustomerImportRow): MatchKeys {
    return {
      email: row.email.trim().toLowerCase(),
      cpf: onlyDigits(row.cpf),
      phone: onlyDigits(row.phone),
    };
  }

  private matchKeysForInsert(row: CustomerInsert): MatchKeys {
    return {
      email: (row.email ?? '').trim().toLowerCase(),
      cpf: onlyDigits(row.cpf ?? ''),
      phone: onlyDigits(row.phone ?? ''),
    };
  }

  /**
   * Mesma pessoa repetida no arquivo (mesmo email/CPF/telefone): mantém a
   * PRIMEIRA linha e marca `duplicated_in_file`. Linha sem nenhum
   * identificador (só nome) não dá pra deduplicar — cada uma passa.
   */
  private consolidateDuplicates(
    rows: CustomerImportRow[],
  ): CustomerImportRow[] {
    const seen = new Map<string, CustomerImportRow>();
    const result: CustomerImportRow[] = [];

    for (const row of rows) {
      const keys = this.matchKeysFor(row);
      const dedupKey = keys.email
        ? `email:${keys.email}`
        : keys.cpf
          ? `cpf:${keys.cpf}`
          : keys.phone
            ? `phone:${keys.phone}`
            : null;

      if (!dedupKey) {
        result.push(row);
        continue;
      }

      const existing = seen.get(dedupKey);
      if (existing) {
        existing.duplicated_in_file = true;
        continue;
      }

      const copy = { ...row };
      seen.set(dedupKey, copy);
      result.push(copy);
    }

    return result;
  }

  private validateRow(row: CustomerImportRow): string | null {
    if (!row.name) return 'Nome vazio';
    if (row.email && !EMAIL_RE.test(row.email)) return 'E-mail inválido';
    return null;
  }

  // --------------------------------------------------------------------
  // Clientes já cadastrados
  // --------------------------------------------------------------------

  /**
   * Carrega os clientes existentes e indexa por email (minúsculo), CPF
   * (dígitos) e telefone (dígitos). Import de base é operação de onboarding
   * — a tabela `customers` desta loja fica na casa das centenas por muito
   * tempo, então carregar tudo e casar em memória é mais simples e correto
   * que 3 queries filtradas com as pegadinhas de caixa/máscara.
   */
  private async loadExistingCustomerIndex(): Promise<ExistingCustomerIndex> {
    const byEmail = new Map<string, ExistingCustomerRef>();
    const byCpf = new Map<string, ExistingCustomerRef>();
    const byPhone = new Map<string, ExistingCustomerRef>();

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.supabase
        .from('customers')
        .select('id, name, email, cpf, phone')
        .range(from, from + pageSize - 1);

      if (error) {
        throw new InternalServerErrorException(
          `Erro ao carregar clientes existentes: ${error.message}`,
        );
      }

      for (const c of data ?? []) {
        const emailKey = (c.email ?? '').trim().toLowerCase();
        if (emailKey && !byEmail.has(emailKey)) {
          byEmail.set(emailKey, {
            id: c.id,
            name: c.name,
            matched_by: 'email',
          });
        }
        const cpfKey = onlyDigits(c.cpf ?? '');
        if (cpfKey && !byCpf.has(cpfKey)) {
          byCpf.set(cpfKey, { id: c.id, name: c.name, matched_by: 'cpf' });
        }
        const phoneKey = onlyDigits(c.phone ?? '');
        if (phoneKey && !byPhone.has(phoneKey)) {
          byPhone.set(phoneKey, {
            id: c.id,
            name: c.name,
            matched_by: 'phone',
          });
        }
      }

      if (!data || data.length < pageSize) break;
    }

    return { byEmail, byCpf, byPhone };
  }

  private lookupExisting(
    keys: MatchKeys,
    index: ExistingCustomerIndex,
  ): ExistingCustomerRef | null {
    if (keys.email) {
      const match = index.byEmail.get(keys.email);
      if (match) return match;
    }
    if (keys.cpf) {
      const match = index.byCpf.get(keys.cpf);
      if (match) return match;
    }
    if (keys.phone) {
      const match = index.byPhone.get(keys.phone);
      if (match) return match;
    }
    return null;
  }

  private toCustomerInsert(item: {
    name: string;
    email?: string;
    phone?: string;
    cpf?: string;
    zipcode?: string;
    address?: string;
    city?: string;
    state?: string;
    notes?: string;
  }): CustomerInsert {
    const clean = (v: string | undefined): string | null => {
      const trimmed = (v ?? '').trim();
      return trimmed === '' ? null : trimmed;
    };
    return {
      name: item.name.trim(),
      email: clean(item.email)?.toLowerCase() ?? null,
      phone: clean(item.phone),
      cpf: clean(item.cpf),
      zipcode: clean(item.zipcode),
      address: clean(item.address),
      city: clean(item.city),
      state: clean(item.state)?.toUpperCase() ?? null,
      notes: clean(item.notes),
    };
  }
}
