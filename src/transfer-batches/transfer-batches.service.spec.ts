import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { TransferBatchesService } from './transfer-batches.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

/** Monta um Buffer .xlsx com o cabeçalho do modelo + linhas (Código, Quantidade). */
function buildWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Código', 'Quantidade'],
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transferência');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const reseller = (id: number, is_active = true) => ({
  id,
  is_active,
  roles: { name: 'vendedor' },
});

const product = (id: number, name = `Peça ${id}`) => ({
  id,
  sku: String(id),
  sku2: `Z${id}`,
  name,
  price: 10,
});

describe('TransferBatchesService', () => {
  let service: TransferBatchesService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferBatchesService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<TransferBatchesService>(TransferBatchesService);
  });

  describe('buildPreview', () => {
    it('soma códigos repetidos, acha pelo nº do item e confere o disponível no Central', async () => {
      mockSupabase.in
        .mockResolvedValueOnce({ data: [reseller(10)], error: null }) // destino
        .mockResolvedValueOnce({
          data: [product(205), product(7)],
          error: null,
        }) // produtos
        .mockResolvedValueOnce({
          data: [
            { product_id: 205, quantity: 5 },
            { product_id: 7, quantity: 1 },
          ],
          error: null,
        }); // estoque da origem

      const result = await service.buildPreview(
        buildWorkbookBuffer([
          ['205', 2],
          [7, 1],
          ['205', 1],
        ]),
        null,
        10,
      );

      expect(mockSupabase.is).toHaveBeenCalledWith('user_id', null);
      expect(result.erros).toEqual([]);
      expect(
        result.validos.map((v) => [
          v.sku,
          v.quantity,
          v.available,
          v.row_numbers,
        ]),
      ).toEqual([
        ['7', 1, 1, [3]],
        ['205', 3, 5, [2, 4]],
      ]);
    });

    it('lê o disponível da revendedora de origem', async () => {
      mockSupabase.in
        .mockResolvedValueOnce({ data: [reseller(10)], error: null })
        .mockResolvedValueOnce({ data: [product(1)], error: null })
        .mockResolvedValueOnce({
          data: [{ product_id: 1, quantity: 2 }],
          error: null,
        });

      const result = await service.buildPreview(
        buildWorkbookBuffer([['1', 2]]),
        10,
        null,
      );

      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 10);
      expect(result.validos).toHaveLength(1);
    });

    it('aponta código vazio, quantidade inválida, código não encontrado e estoque insuficiente', async () => {
      mockSupabase.in
        .mockResolvedValueOnce({ data: [reseller(10)], error: null })
        .mockResolvedValueOnce({ data: [product(6, 'Anel')], error: null })
        .mockResolvedValueOnce({
          data: [{ product_id: 6, quantity: 3 }],
          error: null,
        });

      const result = await service.buildPreview(
        buildWorkbookBuffer([
          ['999', 1],
          ['5', 'abc'],
          ['', 2],
          ['6', 10],
          ['7', 1.5],
        ]),
        null,
        10,
      );

      expect(result.validos).toEqual([]);
      expect(result.erros.map((e) => [e.row_numbers, e.reason])).toEqual([
        [[2], 'Código não encontrado'],
        [[3], 'Quantidade inválida (use um número inteiro maior que zero)'],
        [[4], 'Código vazio'],
        [
          [5],
          'Estoque insuficiente na origem para "Anel": disponível 3, pedido 10',
        ],
        [[6], 'Quantidade inválida (use um número inteiro maior que zero)'],
      ]);
    });

    it('ignora linhas totalmente vazias e casa o código sem diferenciar maiúsculas', async () => {
      mockSupabase.in
        .mockResolvedValueOnce({ data: [reseller(10)], error: null })
        .mockResolvedValueOnce({
          data: [{ ...product(3), sku: 'AB3' }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ product_id: 3, quantity: 1 }],
          error: null,
        });

      const result = await service.buildPreview(
        buildWorkbookBuffer([
          ['', ''],
          [' ab3 ', 1],
        ]),
        null,
        10,
      );

      expect(result.erros).toEqual([]);
      expect(result.validos.map((v) => v.sku)).toEqual(['AB3']);
    });

    it('rejeita origem igual ao destino sem consultar nada', async () => {
      await expect(
        service.buildPreview(buildWorkbookBuffer([['1', 1]]), null, null),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('rejeita destino que não é revendedora ativa', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10, false)],
        error: null,
      });

      await expect(
        service.buildPreview(buildWorkbookBuffer([['1', 1]]), null, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita revendedora desativada como origem (recolher o estoque dela)', async () => {
      mockSupabase.in
        .mockResolvedValueOnce({ data: [reseller(10, false)], error: null })
        .mockResolvedValueOnce({ data: [product(1)], error: null })
        .mockResolvedValueOnce({
          data: [{ product_id: 1, quantity: 1 }],
          error: null,
        });

      const result = await service.buildPreview(
        buildWorkbookBuffer([['1', 1]]),
        10,
        null,
      );

      expect(result.validos).toHaveLength(1);
    });
  });

  describe('buildPreviewAll', () => {
    it('devolve tudo que a revendedora tem, em ordem de código', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10)],
        error: null,
      });
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          { product_id: 20, quantity: 2, products: product(20) },
          { product_id: 3, quantity: 1, products: product(3) },
        ],
        error: null,
      });

      const result = await service.buildPreviewAll(10);

      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 10);
      expect(mockSupabase.gt).toHaveBeenCalledWith('quantity', 0);
      expect(result.validos.map((v) => [v.sku, v.quantity])).toEqual([
        ['3', 1],
        ['20', 2],
      ]);
    });
  });

  describe('create', () => {
    const dto = {
      from_user_id: null,
      to_user_id: 10,
      notes: '  mala de outubro ',
      items: [
        { product_id: 1, quantity: 2 },
        { product_id: 2, quantity: 1 },
      ],
    };

    it('chama fn_transfer_stock_batch com as peças e quem fez', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10)],
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({ data: 42, error: null });

      const result = await service.create(dto, {
        sub: 7,
        email: 'a@b.c',
        role: 'admin',
        role_id: 1,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_transfer_stock_batch', {
        p_from_user_id: null,
        p_to_user_id: 10,
        p_notes: 'mala de outubro',
        p_created_by: 7,
        p_items: dto.items,
      });
      expect(result).toEqual({ id: 42 });
    });

    it('estoque que mudou desde a prévia vira 400 e avisa que nada foi transferido', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10)],
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'INSUFFICIENT_STOCK: Estoque insuficiente para "Anel" — disponível: 0, solicitado: 2',
        },
      });

      await expect(service.create(dto)).rejects.toThrow(
        /Anel.*Nada foi transferido/,
      );
    });

    it('INVALID_TRANSFER do banco vira 400', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10)],
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'INVALID_TRANSFER: quantidade inválida em um ou mais itens',
        },
      });

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('outro erro do banco vira 500', async () => {
      mockSupabase.in.mockResolvedValueOnce({
        data: [reseller(10)],
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      });

      await expect(service.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne', () => {
    it('lote inexistente vira 404', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    it('monta o romaneio com as peças em ordem de código', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 5,
          from_user_id: null,
          to_user_id: 10,
          notes: null,
          total_items: 2,
          total_quantity: 3,
          created_at: '2026-10-15T12:00:00Z',
          from_user: null,
          to_user: { name: 'Ana' },
          creator: { name: 'Gestora' },
        },
        error: null,
      });
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          { id: 1, product_id: 20, quantity: 1, products: product(20) },
          { id: 2, product_id: 3, quantity: 2, products: product(3) },
        ],
        error: null,
      });

      const result = await service.findOne(5);

      expect(result.to_name).toBe('Ana');
      expect(result.from_name).toBeNull();
      expect(result.created_by_name).toBe('Gestora');
      expect(result.items.map((i) => [i.sku, i.quantity])).toEqual([
        ['3', 2],
        ['20', 1],
      ]);
    });
  });
});
