import { Test, TestingModule } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { PurchaseImportService } from './purchase-import.service';
import { SettingsService } from '../settings/settings.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

/**
 * Monta um Buffer .xlsx com cabeçalho fixo (Produto/Descrição/Qtd./Valor
 * Base/Valor de Venda) + linhas de dados. A 5ª coluna (Valor de Venda) é
 * opcional por linha — pode simplesmente não incluir o elemento.
 */
function buildWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const aoa = [
    ['Produto', 'Descrição', 'Qtd.', 'Valor Base', 'Valor de Venda'],
    ...rows,
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('PurchaseImportService', () => {
  let service: PurchaseImportService;
  let mockSupabase: MockSupabaseClient;
  let mockSettingsService: Partial<SettingsService>;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();
    // Por padrão nenhuma chave de site_settings está configurada — o
    // serviço cai nos defaults embutidos no código (mesmos valores
    // semeados pela migration 20260811000001).
    mockSettingsService = {
      findOne: jest.fn().mockRejectedValue(new Error('not configured')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseImportService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<PurchaseImportService>(PurchaseImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildPreview', () => {
    it('preserva o SKU exatamente como veio na célula, mesmo com zero à esquerda perdido em uma das planilhas (não normaliza, não deduplica)', async () => {
      // Caso real dos 2 arquivos de exemplo da Zarpellon: a mesma peça
      // aparece ora como número puro (perde o zero à esquerda), ora como
      // texto (mantém). Decisão explícita: gravar como veio, sem strip
      // nem padding — então viram 2 linhas "novo produto" distintas.
      const buffer = buildWorkbookBuffer([
        [1171530601522, 'TESTE PRODUTO UM', 2, 10],
        ['01171530601522', 'TESTE PRODUTO DOIS', 3, 15],
      ]);

      mockSupabase.in.mockResolvedValueOnce({ data: [], error: null }); // findExistingProducts
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 5 },
        error: null,
      }); // categoria fallback "A classificar" (cacheada após a 1ª linha)

      const result = await service.buildPreview(buffer);

      expect(result.novos).toHaveLength(2);
      const skus = result.novos.map((r) => r.sku2);
      expect(skus).toEqual(['1171530601522', '01171530601522']);
      expect(skus[0]).not.toBe(skus[1]);
      expect(result.atualizacoes).toHaveLength(0);
      expect(result.erros).toHaveLength(0);
    });

    it('filtra item não-catalogável pela palavra-chave de exclusão (não gera produto)', async () => {
      const buffer = buildWorkbookBuffer([
        [
          '50628915711000',
          'SACOLA PAPEL LISO - DOURADA 11,5X15X6 PCT C/10',
          3,
          27.5,
        ],
      ]);

      const result = await service.buildPreview(buffer);

      expect(result.naoCatalogaveis).toHaveLength(1);
      expect(result.naoCatalogaveis[0].matched_keyword).toBe('SACOLA');
      expect(result.novos).toHaveLength(0);
      expect(result.erros).toHaveLength(0);
      // Nenhum item catalogável -> não precisa nem consultar produtos existentes.
      expect(mockSupabase.in).not.toHaveBeenCalled();
    });

    describe('kits e palavras-chave', () => {
      /** Catálogo vazio e categoria sugerida encontrada. */
      const mockNewProductLookups = () => {
        mockSupabase.in.mockResolvedValue({ data: [], error: null });
        mockSupabase.maybeSingle.mockResolvedValue({
          data: { id: 3 },
          error: null,
        });
      };

      it('cataloga peça que só cita a embalagem ("KIT 12 BRINCOS COM CAIXA")', async () => {
        mockNewProductLookups();
        const buffer = buildWorkbookBuffer([
          ['K1', 'KIT 12 BRINCOS COM CAIXA', 2, 60, 240],
        ]);

        const result = await service.buildPreview(buffer);

        expect(result.naoCatalogaveis).toHaveLength(0);
        expect(result.novos).toHaveLength(1);
        expect(result.novos[0]).toMatchObject({
          pieces_per_kit: 12,
          pieces_per_kit_suggested: true,
          category_name: 'Brincos', // categoria pela descrição sem "KIT 12"
          category_low_confidence: false,
          // preview segue por unidade comprada (kit); o confirm divide
          quantity: 2,
          unit_cost: 60,
          suggested_price: 240,
        });
      });

      it('palavra-chave de exclusão só conta no início de palavra ("ENCAIXE" ≠ CAIXA)', async () => {
        mockNewProductLookups();
        const buffer = buildWorkbookBuffer([
          ['P1', 'PINGENTE ENCAIXE DOURADO', 1, 10],
          ['S1', 'SACOLAS KRAFT', 1, 5],
        ]);

        const result = await service.buildPreview(buffer);

        expect(result.novos.map((r) => r.sku2)).toEqual(['P1']);
        expect(result.naoCatalogaveis.map((r) => r.sku2)).toEqual(['S1']);
      });

      it('produto comum sai com 1 peça por unidade, sem sugestão', async () => {
        mockNewProductLookups();
        const buffer = buildWorkbookBuffer([['A1', 'ANEL SOLITARIO', 1, 10]]);

        const result = await service.buildPreview(buffer);

        expect(result.novos[0]).toMatchObject({
          pieces_per_kit: 1,
          pieces_per_kit_suggested: false,
        });
      });
    });

    it('consolida SKU duplicado dentro do mesmo arquivo (soma quantidade, fica com o último custo)', async () => {
      const buffer = buildWorkbookBuffer([
        ['1171530601522', 'ANEL TESTE', 2, 10],
        ['1171530601522', 'ANEL TESTE', 3, 20],
      ]);

      mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      }); // categoria "Aneis"

      const result = await service.buildPreview(buffer);

      expect(result.novos).toHaveLength(1);
      expect(result.novos[0].quantity).toBe(5);
      expect(result.novos[0].unit_cost).toBe(20);
      expect(result.novos[0].duplicated_in_file).toBe(true);
      expect(result.novos[0].category_name).toBe('Aneis');
      expect(result.novos[0].category_low_confidence).toBe(false);
    });

    it('classifica como atualização de estoque quando o sku2 já existe no catálogo', async () => {
      const buffer = buildWorkbookBuffer([['EXIST1', 'ANEL EXISTENTE', 2, 10]]);

      mockSupabase.in.mockResolvedValueOnce({
        data: [
          {
            id: 9,
            sku2: 'EXIST1',
            sku2_alt: null,
            name: 'Anel Existente',
            current_stock: 3,
            price: 40,
            is_active: true,
          },
        ],
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.atualizacoes).toHaveLength(1);
      expect(result.atualizacoes[0].existing_product).toEqual({
        id: 9,
        name: 'Anel Existente',
        current_stock: 3,
        price: 40,
        sku2: 'EXIST1',
        sku2_alt: null,
        matched_by: 'sku2',
        match_count: 1,
      });
      expect(result.novos).toHaveLength(0);
    });

    it('reconhece o produto pelo 2º código (sku2_alt), sem diferenciar maiúsculas', async () => {
      const buffer = buildWorkbookBuffer([['ab-77 ', 'ANEL', 1, 10]]);

      mockSupabase.in
        .mockResolvedValueOnce({ data: [], error: null }) // sku2
        .mockResolvedValueOnce({
          data: [
            {
              id: 4,
              sku2: 'X1',
              sku2_alt: 'AB-77',
              name: 'Anel',
              current_stock: 1,
              price: 30,
              is_active: true,
            },
          ],
          error: null,
        }); // sku2_alt

      const result = await service.buildPreview(buffer);

      expect(mockSupabase.in).toHaveBeenNthCalledWith(
        2,
        'sku2_alt',
        expect.arrayContaining(['AB-77']),
      );
      expect(result.atualizacoes).toHaveLength(1);
      expect(result.atualizacoes[0].existing_product).toMatchObject({
        id: 4,
        matched_by: 'sku2_alt',
      });
    });

    it('com código duplicado no catálogo escolhe de forma determinística e avisa', async () => {
      const buffer = buildWorkbookBuffer([['DUP', 'ANEL', 1, 10]]);
      const product = (id: number, is_active: boolean) => ({
        id,
        sku2: 'DUP',
        sku2_alt: null,
        name: `Anel ${id}`,
        current_stock: 0,
        price: 30,
        is_active,
      });

      mockSupabase.in.mockResolvedValueOnce({
        data: [product(30, true), product(12, false), product(20, true)],
        error: null,
      });

      const result = await service.buildPreview(buffer);

      // ativo antes de inativo, depois menor id
      expect(result.atualizacoes[0].existing_product).toMatchObject({
        id: 20,
        match_count: 3,
      });
    });

    it('usa o "Valor de Venda" da planilha como preço sugerido quando preenchido', async () => {
      const buffer = buildWorkbookBuffer([
        ['SKU_PRECO', 'ANEL JÁ PRECIFICADO', 2, 10, 29.9],
      ]);

      mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.novos[0].suggested_price).toBe(29.9); // não é unit_cost×3 (30)
    });

    it('cai na regra padrão (unit_cost × 3) quando "Valor de Venda" vem vazio', async () => {
      const buffer = buildWorkbookBuffer([
        ['SKU_SEM_PRECO', 'ANEL SEM PREÇO NA PLANILHA', 2, 10],
      ]);

      mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.novos[0].suggested_price).toBe(30);
    });

    it('rejeita linha inválida sem abortar o restante do arquivo', async () => {
      const buffer = buildWorkbookBuffer([
        ['SKU_OK', 'ANEL VÁLIDO', 2, 10],
        ['SKU_BAD', 'ANEL QTD ZERO', 0, 10],
      ]);

      mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.erros).toHaveLength(1);
      expect(result.erros[0].reason).toBe('Quantidade inválida');
      expect(result.novos).toHaveLength(1);
      expect(result.novos[0].sku2).toBe('SKU_OK');
    });
  });

  describe('confirm', () => {
    it('resolve o fornecedor Zarpellon por nome e chama a RPC com o payload certo', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 2 },
        error: null,
      }); // fornecedor já existe
      mockSupabase.rpc.mockResolvedValueOnce({ data: 42, error: null });

      const result = await service.confirm({
        items: [
          {
            is_new: true,
            sku2: 'NEW1',
            name: 'Novo Produto',
            quantity: 2,
            unit_cost: 10,
            price: 29.9,
          },
          { is_new: false, product_id: 5, quantity: 1, unit_cost: 20 },
        ],
      });

      expect(result).toEqual({ purchase_id: 42, created: 1, updated: 1 });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_import_purchase_excel',
        expect.objectContaining({
          p_supplier_id: 2,
          p_items: [
            expect.objectContaining({
              is_new: true,
              sku2: 'NEW1',
              quantity: 2,
              unit_cost: 10,
              price: 29.9,
            }),
            expect.objectContaining({
              is_new: false,
              product_id: 5,
              quantity: 1,
              unit_cost: 20,
              total_cost: 20,
              price: null,
              sku2_alt: null,
            }),
          ],
        }),
      );
    });

    it('desmembra kit em peças: estoque, custo e preço por peça, total exato', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 2 },
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({ data: 43, error: null });

      await service.confirm({
        items: [
          {
            is_new: true,
            sku2: 'KIT12',
            sku2_alt: ' k12b ',
            name: 'KIT 12 BRINCOS',
            quantity: 2, // kits
            unit_cost: 10, // custo do kit
            price: 120, // preço do kit inteiro (planilha)
            pieces_per_kit: 12,
          },
          {
            is_new: false,
            product_id: 7,
            quantity: 1,
            unit_cost: 10,
            pieces_per_kit: 3,
          },
        ],
      });

      const payload = (mockSupabase.rpc.mock.calls[0] as unknown[])[1] as {
        p_items: Record<string, unknown>[];
      };
      expect(payload.p_items[0]).toMatchObject({
        quantity: 24, // peças
        unit_cost: 0.83, // 10 / 12, em centavos
        total_cost: 20, // 2 kits × 10 (exato)
        price: 10, // 120 / 12
        sku2_alt: 'K12B',
      });
      expect(payload.p_items[1]).toMatchObject({
        quantity: 3,
        unit_cost: 3.33,
        total_cost: 10,
        sku2_alt: null, // atualização não grava 2º código
      });
    });

    it('rejeita item novo sem sku2/name antes de chamar o banco', async () => {
      await expect(
        service.confirm({
          items: [{ is_new: true, quantity: 1, unit_cost: 10 }],
        }),
      ).rejects.toThrow('sku2 e name são obrigatórios');

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });
});
