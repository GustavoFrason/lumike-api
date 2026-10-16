/**
 * ProductsService
 * --------------------
 * Responsável por operações CRUD de produtos no Supabase.
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  buildExactCodeOr,
  buildIlikeOr,
  sanitizeFilterTerm,
} from '../common/utils/postgrest-filter.util';
import {
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCTS_MAX_LIMIT,
  STAFF_PRODUCT_SELECT,
  STAFF_PRODUCTS_MAX_LIMIT,
} from './product-columns';

/** `newest` = mais novos primeiro (padrão); `code` = número do item crescente. */
export type ProductSort = 'newest' | 'code';

export interface FindProductsOptions {
  page?: number;
  limit?: number;
  isActive?: boolean;
  search?: string;
  categoryId?: number;
  collectionId?: string;
  isFeatured?: boolean;
  sort?: ProductSort;
  publicView?: boolean;
}

const EXACT_MATCH_LIMIT = 20;

/** Linha da listagem: colunas variam entre visão pública e de staff. */
type ProductListRow = { id: number; exact_match?: boolean } & Record<
  string,
  unknown
>;

/**
 * Campo de texto opcional vindo do form: `undefined` = não mexer;
 * vazio/só espaços = limpar (null); senão o texto aparado (opcionalmente
 * em maiúsculas, como os códigos do fornecedor).
 */
function normalizeOptionalText(
  value: string | null | undefined,
  upper = false,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return upper ? trimmed.toUpperCase() : trimmed;
}

type CodeFields = {
  id: number;
  sku: string | null;
  sku2: string | null;
  sku2_alt: string | null;
};

/**
 * Ordena resultados de busca exata pela prioridade do campo que bateu:
 * sku → sku2 → sku2_alt → id; empate pelo menor id.
 */
export function rankExactCodeMatches<T extends CodeFields>(
  rows: T[],
  code: string,
): T[] {
  const term = code.trim().toUpperCase();
  const rank = (p: T) => {
    if (p.sku?.toUpperCase() === term) return 0;
    if (p.sku2?.toUpperCase() === term) return 1;
    if (p.sku2_alt?.toUpperCase() === term) return 2;
    return 3; // bateu pelo id
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Cria um novo produto.
   *
   * O produto SEMPRE nasce com estoque 0: `current_stock` é só o espelho do
   * estoque Central (inventory_locations), mantido por fn_adjust_stock. O
   * estoque inicial entra como movimentação (entrada/compra) — gravar o
   * número aqui criava divergência entre o cadastro e o controle por local.
   */
  async create(createProductDto: CreateProductDto) {
    const productData = createProductDto;

    // `sku` não é mais checado por duplicidade aqui:
    // não é mais digitado pelo usuário (vira o `id` autoincrementado via
    // trigger fn_generate_product_sku, sempre único por natureza). Repetir
    // o `sku2` (SKU do fornecedor) é um caso válido — é o que aciona o
    // fluxo de "produto existente, somar ao estoque" no admin.
    const { data: productDataResult, error } = await this.supabase
      .from('products')
      .insert({
        sku: productData.sku,
        sku2: productData.sku2,
        name: productData.name,
        short_description: productData.short_description,
        description: productData.description,
        slug: productData.slug,
        price: productData.price,
        preco_promocional: productData.preco_promocional,
        cost_price: productData.cost_price || 0,
        purchase_date: productData.purchase_date,
        category_id: productData.category_id,
        supplier_id: productData.supplier_id,
        colecao_id: productData.colecao_id,
        collection: productData.collection,
        current_stock: 0,
        min_stock: productData.min_stock || 0,
        is_active:
          productData.is_active !== undefined ? productData.is_active : true,
        is_featured:
          productData.is_featured !== undefined
            ? productData.is_featured
            : false,
        label_text: normalizeOptionalText(productData.label_text),
        sku2_alt: normalizeOptionalText(productData.sku2_alt, true),
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar produto: ${error.message}`,
      );
    }

    return productDataResult;
  }

  /**
   * Lista todos os produtos (com paginação opcional).
   *
   * `publicView` (visitante/cliente): só produtos ativos, só colunas
   * públicas (sem custo/fornecedor), sempre "mais novos primeiro" e no
   * máximo PUBLIC_PRODUCTS_MAX_LIMIT por página. Staff recebe tudo.
   *
   * Staff com busca, na página 1: os produtos cujo código bate EXATAMENTE
   * (sku, sku2, sku2_alt ou id) vêm primeiro, marcados com `exact_match` —
   * buscar "7" não enterra mais o item 7 no meio de 17, 70, 107...
   */
  async findAll(options: FindProductsOptions = {}) {
    const {
      page = 1,
      isActive,
      search,
      categoryId,
      collectionId,
      isFeatured,
      publicView = false,
    } = options;
    const sort: ProductSort = publicView
      ? 'newest'
      : (options.sort ?? 'newest');
    // PostgREST devolve no máximo 1000 linhas por requisição (max_rows);
    // pedir mais só fazia o front achar que tinha recebido tudo.
    const limit = Math.min(
      options.limit ?? 50,
      publicView ? PUBLIC_PRODUCTS_MAX_LIMIT : STAFF_PRODUCTS_MAX_LIMIT,
    );

    let query = this.supabase
      .from('products')
      .select(publicView ? PUBLIC_PRODUCT_SELECT : STAFF_PRODUCT_SELECT, {
        count: 'exact',
      });

    query =
      sort === 'code'
        ? // "Em ordem crescente" pelo número do item; SKU não numérico no fim
          query
            .order('sku_sort', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true })
        : // `id` desempata produtos de uma mesma importação (mesmo created_at),
          // senão a paginação repetia/pulava itens
          query
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });

    if (publicView) {
      query = query.eq('is_active', true);
    } else if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (collectionId) {
      query = query.eq('colecao_id', collectionId);
    }

    const searchFilter = buildIlikeOr(
      publicView ? ['name', 'sku'] : ['name', 'sku', 'sku2', 'sku2_alt'],
      search,
    );
    if (searchFilter) {
      query = query.or(searchFilter);
    }

    if (isFeatured !== undefined) {
      query = query.eq('is_featured', isFeatured);
    }

    // Paginação
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar produtos: ${error.message}`,
      );
    }

    // O select muda entre visão pública e de staff; o parser de tipos do
    // supabase-js não resolve essa união, então tipamos só o que usamos.
    const baseRows = (data ?? []) as unknown as ProductListRow[];
    let rows: ProductListRow[] = baseRows;

    if (!publicView && searchFilter && page === 1) {
      const exact = await this.findExactCodeMatches(search, {
        isActive,
        categoryId,
        isFeatured,
      });
      if (exact.length > 0) {
        const exactIds = new Set(exact.map((p) => p.id));
        rows = [
          ...exact.map((p) => ({ ...p, exact_match: true })),
          ...baseRows.filter((p) => !exactIds.has(p.id)),
        ];
      }
    }

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count ?? baseRows.length,
      },
    };
  }

  /**
   * Busca exata por código para o admin/PDV (leitor de código, cadastro
   * de produto, conferência de duplicidade): sku, sku2 e sku2_alt iguais
   * ao termo (sem diferenciar maiúsculas), ou o id quando o termo é
   * numérico. Ordem: sku → sku2 → sku2_alt → id.
   */
  async lookup(code: string, activeOnly = false) {
    return this.findExactCodeMatches(code, {
      isActive: activeOnly ? true : undefined,
    });
  }

  private async findExactCodeMatches(
    rawCode: string | undefined,
    filters: { isActive?: boolean; categoryId?: number; isFeatured?: boolean },
  ) {
    const code = sanitizeFilterTerm(rawCode);
    const codeFilter = buildExactCodeOr(['sku', 'sku2', 'sku2_alt'], code);
    if (!codeFilter) return [];

    const idFilter = /^\d{1,15}$/.test(code) ? `,id.eq.${Number(code)}` : '';

    let query = this.supabase
      .from('products')
      .select(STAFF_PRODUCT_SELECT)
      .or(`${codeFilter}${idFilter}`);

    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.isFeatured !== undefined) {
      query = query.eq('is_featured', filters.isFeatured);
    }

    const { data, error } = await query.limit(EXACT_MATCH_LIMIT);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar produto por código: ${error.message}`,
      );
    }

    return rankExactCodeMatches(data, code);
  }

  /**
   * Busca um produto por ID
   */
  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('products')
      .select(
        `
        *,
        categories:category_id (
          id,
          name,
          slug
        ),
        images:imagens_produto (
          url,
          ordem
        )
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Produto com ID ${id} não encontrado`);
    }

    return data;
  }

  /**
   * Busca um produto por slug. Em `publicView`, produto inativo é 404 e
   * as colunas internas (custo/fornecedor) não vêm.
   */
  async findBySlug(slug: string, publicView = false) {
    let query = this.supabase
      .from('products')
      .select(publicView ? PUBLIC_PRODUCT_SELECT : STAFF_PRODUCT_SELECT)
      .eq('slug', slug);

    if (publicView) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      throw new NotFoundException(`Produto com slug "${slug}" não encontrado`);
    }

    return data;
  }

  /**
   * Atualiza um produto
   */
  async update(id: number, updateProductDto: UpdateProductDto) {
    // Verifica se o produto existe
    await this.findOne(id);

    // 1. Atualizar Produto principal
    const { data, error } = await this.supabase
      .from('products')
      .update({
        sku: updateProductDto.sku,
        sku2: updateProductDto.sku2,
        name: updateProductDto.name,
        short_description: updateProductDto.short_description,
        description: updateProductDto.description,
        slug: updateProductDto.slug,
        price: updateProductDto.price,
        preco_promocional: updateProductDto.preco_promocional,
        cost_price: updateProductDto.cost_price,
        purchase_date: updateProductDto.purchase_date,
        // `current_stock` NÃO é gravado na edição: ele espelha o estoque
        // Central e só muda por movimentação (entrada, saída, conferência,
        // compra, venda, transferência). Gravar aqui fazia o cadastro
        // divergir do controle por local (ex: lista mostrando 4 e a
        // transferência recusando por só existir 1).
        min_stock: updateProductDto.min_stock,
        category_id: updateProductDto.category_id,
        supplier_id: updateProductDto.supplier_id,
        colecao_id: updateProductDto.colecao_id,
        collection: updateProductDto.collection,
        is_active: updateProductDto.is_active,
        is_featured: updateProductDto.is_featured,
        label_text: normalizeOptionalText(updateProductDto.label_text),
        sku2_alt: normalizeOptionalText(updateProductDto.sku2_alt, true),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar produto: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Remove um produto (soft delete - marca como inativo)
   */
  async remove(id: number) {
    // Verifica se o produto existe
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao remover produto: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Remove um produto permanentemente (hard delete)
   */
  async delete(id: number) {
    // Verifica se o produto existe
    await this.findOne(id);

    const { error } = await this.supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao deletar produto: ${error.message}`,
      );
    }

    return { message: 'Produto deletado permanentemente' };
  }

  /**
   * Ativa ou desativa vários produtos de uma vez.
   *
   * Devolve `{ updated }`: antes devolvia o `data` de um update sem
   * `.select()` (sempre null), o Nest respondia corpo vazio e o proxy do
   * front quebrava no `response.json()` — a tela mostrava erro mesmo com a
   * alteração feita.
   */
  async setActiveMany(ids: number[], isActive: boolean) {
    const { data, error } = await this.supabase
      .from('products')
      .update({ is_active: isActive })
      .in('id', ids)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao ${isActive ? 'ativar' : 'desativar'} produtos em massa: ${error.message}`,
      );
    }

    return { updated: data?.length ?? 0 };
  }
}
