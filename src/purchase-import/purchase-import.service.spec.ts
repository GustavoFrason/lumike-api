import { Test, TestingModule } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { PurchaseImportService } from './purchase-import.service';
import { SettingsService } from '../settings/settings.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

/** Monta um Buffer .xlsx com cabeçalho fixo (Produto/Descrição/Qtd./Valor Base) + linhas de dados. */
function buildWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const aoa = [['Produto', 'Descrição', 'Qtd.', 'Valor Base'], ...rows];
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
          { id: 9, sku2: 'EXIST1', name: 'Anel Existente', current_stock: 3 },
        ],
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.atualizacoes).toHaveLength(1);
      expect(result.atualizacoes[0].existing_product).toEqual({
        id: 9,
        name: 'Anel Existente',
        current_stock: 3,
      });
      expect(result.novos).toHaveLength(0);
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
            }),
            expect.objectContaining({
              is_new: false,
              product_id: 5,
              quantity: 1,
              unit_cost: 20,
            }),
          ],
        }),
      );
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
