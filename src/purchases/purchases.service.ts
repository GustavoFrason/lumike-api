import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemDto {
  @IsInt()
  product_id: number;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_cost: number;
}

export class CreatePurchaseDto {
  @IsInt()
  supplier_id: number;

  /**
   * Data real da compra ('YYYY-MM-DD'), pode ser retroativa. Sem ela, vale o
   * padrão da coluna (hoje em Brasília).
   */
  @IsOptional()
  @IsDateString({}, { message: 'Data da compra inválida (use AAAA-MM-DD)' })
  purchase_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

/**
 * Campos do produto que a etiqueta usa (LabelContent e ZPL na UI): com eles
 * a tela de etiquetas imprime a compra inteira, inclusive produtos inativos,
 * que não vêm na lista de produtos dela.
 */
const LABEL_PRODUCT_FIELDS =
  'id, name, sku, sku2, price, preco_promocional, label_text, is_active';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async create(dto: CreatePurchaseDto) {
    // Calculate total amount
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.unit_cost * item.quantity,
      0,
    );

    // 1. Create Purchase record
    const { data: purchase, error: pError } = await this.supabase
      .from('purchases')
      .insert({
        supplier_id: dto.supplier_id,
        total_amount: totalAmount,
        notes: dto.notes,
        purchase_date: dto.purchase_date,
      })
      .select()
      .single();

    if (pError)
      throw new InternalServerErrorException(
        `Erro ao criar compra: ${pError.message}`,
      );

    // 2. Create Purchase Items
    const purchaseItems = dto.items.map((item) => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    }));

    const { error: piError } = await this.supabase
      .from('purchase_items')
      .insert(purchaseItems);

    if (piError)
      throw new InternalServerErrorException(
        `Erro ao criar itens da compra: ${piError.message}`,
      );

    // 3. Update Product Stock and Cost Price
    for (const item of dto.items) {
      // Update cost_price (we could use average cost, but for now we update to latest)
      const { error: productUpdateError } = await this.supabase
        .from('products')
        .update({
          cost_price: item.unit_cost,
          supplier_id: dto.supplier_id, // Also auto-link supplier if not set
        })
        .eq('id', item.product_id);

      // Antes esse erro era ignorado silenciosamente — foi assim que a
      // coluna products.supplier_id ausente em produção (migration
      // 20260127 nunca aplicada) passou despercebida: a compra "funcionava"
      // (linha em purchases/purchase_items criada certo), só esse update
      // falhava caladinho, sem log e sem afetar a resposta da API.
      if (productUpdateError) {
        this.logger.warn(
          `Falha ao atualizar custo/fornecedor do produto #${item.product_id}: ${productUpdateError.message}`,
        );
      }

      // O estoque é atualizado pelo trigger `tg_purchase_items_ai` (ver
      // supabase/migrations), então não precisa mexer no estoque aqui.
    }

    return purchase;
  }

  async findAll(page = 1, limit = 50) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('purchases')
      .select(
        `
                *,
                suppliers:supplier_id (name),
                items:purchase_items(count)
            `,
        { count: 'exact' },
      )
      // Mais recente primeiro pela data real da compra (pode ser retroativa);
      // o id desempata compras do mesmo dia.
      .order('purchase_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error)
      throw new InternalServerErrorException(
        `Erro ao listar compras: ${error.message}`,
      );

    // A UI (tela "Entradas de Estoque") sempre mostrou 0 itens pra toda
    // compra — o front lia `items_count`, um campo que esta consulta nunca
    // retornou. `items:purchase_items(count)` vem como [{ count: N }].
    const dataWithItemsCount = (data || []).map((purchase) => {
      const itemsRelation = (purchase as { items?: { count: number }[] }).items;
      const { items: _items, ...rest } = purchase as typeof purchase & {
        items?: { count: number }[];
      };
      return { ...rest, items_count: itemsRelation?.[0]?.count ?? 0 };
    });

    return {
      data: dataWithItemsCount,
      pagination: { page, limit, total: count || 0 },
    };
  }

  async findOne(id: number) {
    const { data: purchase, error } = await this.supabase
      .from('purchases')
      .select(
        `
                *,
                suppliers:supplier_id (name),
                items:purchase_items (
                    *,
                    products:product_id (${LABEL_PRODUCT_FIELDS})
                )
            `,
      )
      .eq('id', id)
      .single();

    if (error || !purchase)
      throw new NotFoundException(`Compra #${id} não encontrada`);

    return purchase;
  }
}
