import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseDto, PurchasesService } from './purchases.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get(PurchasesService);
  });

  describe('create', () => {
    const items = [{ product_id: 5, quantity: 2, unit_cost: 10 }];

    it('grava a data real da compra', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 7 },
        error: null,
      });

      await service.create({
        supplier_id: 3,
        purchase_date: '2026-08-31',
        items,
      });

      expect(mockSupabase.insert).toHaveBeenNthCalledWith(1, {
        supplier_id: 3,
        total_amount: 20,
        notes: undefined,
        purchase_date: '2026-08-31',
      });
    });

    it('sem data, deixa o padrão do banco (hoje em Brasília)', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 8 },
        error: null,
      });

      await service.create({ supplier_id: 3, items });

      const purchaseRow = (
        mockSupabase.insert.mock.calls[0] as [Record<string, unknown>]
      )[0];
      expect(purchaseRow.purchase_date).toBeUndefined();
      // Sem a chave no JSON, o Postgres usa o DEFAULT da coluna.
      expect(JSON.parse(JSON.stringify(purchaseRow))).not.toHaveProperty(
        'purchase_date',
      );
    });
  });

  describe('CreatePurchaseDto.purchase_date', () => {
    const errorsFor = (purchase_date: unknown) =>
      validate(
        plainToInstance(CreatePurchaseDto, {
          supplier_id: 3,
          purchase_date,
          items: [{ product_id: 5, quantity: 1, unit_cost: 10 }],
        }),
      );

    it('aceita AAAA-MM-DD', async () => {
      expect(await errorsFor('2026-08-31')).toHaveLength(0);
    });

    it.each(['31/08/2026', 'ontem', 123])('recusa %p', async (value) => {
      const errors = await errorsFor(value);
      expect(errors.map((e) => e.property)).toContain('purchase_date');
      expect(
        Object.values(
          errors.find((e) => e.property === 'purchase_date')!.constraints!,
        ),
      ).toContain('Data da compra inválida (use AAAA-MM-DD)');
    });
  });

  describe('findAll', () => {
    it('lista pela data da compra, mais recente primeiro', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: [{ id: 4, purchase_date: '2026-08-31', items: [{ count: 28 }] }],
        error: null,
        count: 1,
      });

      const result = await service.findAll();

      expect(mockSupabase.order).toHaveBeenNthCalledWith(1, 'purchase_date', {
        ascending: false,
      });
      expect(mockSupabase.order).toHaveBeenNthCalledWith(2, 'id', {
        ascending: false,
      });
      expect(result.data[0]).toMatchObject({ id: 4, items_count: 28 });
    });
  });

  describe('findOne', () => {
    it('traz os campos que a etiqueta usa, inclusive de produto inativo', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 4, items: [] },
        error: null,
      });

      await service.findOne(4);

      const select = (mockSupabase.select.mock.calls[0] as [string])[0];
      for (const field of [
        'name',
        'sku',
        'price',
        'preco_promocional',
        'label_text',
        'is_active',
      ]) {
        expect(select).toContain(field);
      }
    });

    it('compra inexistente vira 404', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'not found' },
      });

      await expect(service.findOne(999)).rejects.toThrow(
        'Compra #999 não encontrada',
      );
    });
  });
});
