import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('InventoryService', () => {
  let service: InventoryService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('addStock', () => {
    it('calls fn_adjust_stock with a positive delta and returns the new quantity', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: 15, error: null });

      const result = await service.addStock(
        1,
        { quantity: 5, reference: 'purchase:1' },
        null,
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_adjust_stock', {
        p_product_id: 1,
        p_user_id: null,
        p_delta: 5,
        p_reference: 'purchase:1',
      });
      expect(result).toEqual({ success: true, newQuantity: 15 });
    });
  });

  describe('removeStock', () => {
    it('calls fn_adjust_stock with a negative delta', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: 3, error: null });

      const result = await service.removeStock(
        1,
        { quantity: 2, reference: 'order:9' },
        7,
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_adjust_stock', {
        p_product_id: 1,
        p_user_id: 7,
        p_delta: -2,
        p_reference: 'order:9',
      });
      expect(result).toEqual({ success: true, newQuantity: 3 });
    });

    it('maps INSUFFICIENT_STOCK from the database into BadRequestException', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'INSUFFICIENT_STOCK: produto 1 não tem saldo suficiente',
        },
      });

      await expect(
        service.removeStock(1, { quantity: 999, reference: 'order:9' }, null),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transferStock', () => {
    it('rejects when origin and destination are the same', async () => {
      await expect(
        service.transferStock(1, {
          from_user_id: 5,
          to_user_id: 5,
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('calls fn_transfer_stock with the given locations', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.transferStock(1, {
        from_user_id: undefined, // undefined = estoque central, mesmo contrato de null usado pelo controller
        to_user_id: 8,
        quantity: 3,
        notes: 'reposição mala',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_transfer_stock', {
        p_product_id: 1,
        p_from_user_id: null,
        p_to_user_id: 8,
        p_quantity: 3,
        p_notes: 'reposição mala',
      });
      expect(result).toEqual({ success: true });
    });

    it('maps INSUFFICIENT_STOCK from fn_transfer_stock into BadRequestException', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'INSUFFICIENT_STOCK: sem saldo na origem' },
      });

      await expect(
        service.transferStock(1, {
          from_user_id: undefined,
          to_user_id: 8,
          quantity: 999,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAllSellersStock', () => {
    const row = (user_id: number, product_id: number, quantity: number) => ({
      user_id,
      quantity,
      product_id,
      users: { id: user_id, name: user_id === 1 ? 'Ana' : 'Bia' },
      products: {
        id: product_id,
        name: 'Anel',
        sku: String(product_id),
        price: 10,
      },
    });

    it('pagina além das 1000 linhas do PostgREST e agrupa por revendedora', async () => {
      const firstPage = Array.from({ length: 1000 }, (_, i) =>
        row(1, i + 1, 1),
      );
      mockSupabase.range
        .mockResolvedValueOnce({ data: firstPage, error: null })
        .mockResolvedValueOnce({ data: [row(2, 5, 3)], error: null });

      const result = await service.getAllSellersStock();

      expect(mockSupabase.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(mockSupabase.range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(
        result.map((s) => [s.name, s.items.length, s.total_items]),
      ).toEqual([
        ['Ana', 1000, 1000],
        ['Bia', 1, 3],
      ]);
    });

    it('converte erro do banco em InternalServerErrorException', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      });

      await expect(service.getAllSellersStock()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
