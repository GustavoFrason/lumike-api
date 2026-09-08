import { Test, TestingModule } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { CustomerImportService } from './customer-import.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

/** Monta um Buffer .xlsx com o cabeçalho do modelo de clientes + linhas de dados. */
function buildWorkbookBuffer(rows: (string | number)[][]): Buffer {
  const header = [
    'Nome',
    'Email',
    'Telefone',
    'CPF',
    'CEP',
    'Endereço',
    'Cidade',
    'Estado',
    'Observações',
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('CustomerImportService', () => {
  let service: CustomerImportService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerImportService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<CustomerImportService>(CustomerImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildPreview', () => {
    it('rejeita linha sem nome sem abortar o resto do arquivo', async () => {
      const buffer = buildWorkbookBuffer([
        ['Maria Silva', 'maria@email.com', '', '', '', '', '', '', ''],
        ['', 'sem.nome@email.com', '', '', '', '', '', '', ''],
      ]);
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.buildPreview(buffer);

      expect(result.erros).toHaveLength(1);
      expect(result.erros[0].reason).toBe('Nome vazio');
      expect(result.novos).toHaveLength(1);
      expect(result.novos[0].name).toBe('Maria Silva');
    });

    it('rejeita e-mail com formato inválido', async () => {
      const buffer = buildWorkbookBuffer([
        ['João', 'joao(arroba)email', '', '', '', '', '', '', ''],
      ]);
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.buildPreview(buffer);

      expect(result.erros).toHaveLength(1);
      expect(result.erros[0].reason).toBe('E-mail inválido');
      expect(result.novos).toHaveLength(0);
    });

    it('consolida a mesma pessoa repetida no arquivo (mantém a primeira, marca o flag)', async () => {
      const buffer = buildWorkbookBuffer([
        ['Ana Paula', 'ANA@email.com', '', '', '', '', '', '', 'primeira'],
        ['Ana P.', 'ana@email.com', '', '', '', '', '', '', 'segunda'],
      ]);
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.buildPreview(buffer);

      expect(result.novos).toHaveLength(1);
      expect(result.novos[0].name).toBe('Ana Paula');
      expect(result.novos[0].notes).toBe('primeira');
      expect(result.novos[0].duplicated_in_file).toBe(true);
    });

    it('classifica como já cadastrado quando o e-mail bate com um cliente existente', async () => {
      const buffer = buildWorkbookBuffer([
        ['Carlos', 'carlos@email.com', '', '', '', '', '', '', ''],
      ]);
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          {
            id: 7,
            name: 'Carlos Antigo',
            email: 'carlos@email.com',
            cpf: null,
            phone: null,
          },
        ],
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.jaCadastrados).toHaveLength(1);
      expect(result.jaCadastrados[0].existing_customer).toEqual({
        id: 7,
        name: 'Carlos Antigo',
        matched_by: 'email',
      });
      expect(result.novos).toHaveLength(0);
    });

    it('casa por telefone ignorando máscara (normaliza para dígitos dos dois lados)', async () => {
      const buffer = buildWorkbookBuffer([
        ['Beatriz', '', '41996086653', '', '', '', '', '', ''],
      ]);
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          {
            id: 3,
            name: 'Bia',
            email: null,
            cpf: null,
            phone: '(41) 99608-6653',
          },
        ],
        error: null,
      });

      const result = await service.buildPreview(buffer);

      expect(result.jaCadastrados).toHaveLength(1);
      expect(result.jaCadastrados[0].existing_customer.matched_by).toBe(
        'phone',
      );
    });

    it('cliente novo cai no bucket novos com os campos normalizados', async () => {
      const buffer = buildWorkbookBuffer([
        [
          '  Fernanda  ',
          'FERNANDA@EMAIL.COM',
          '',
          '',
          '',
          '',
          'Curitiba',
          'pr',
          '',
        ],
      ]);
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.buildPreview(buffer);

      expect(result.novos).toHaveLength(1);
      expect(result.novos[0].name).toBe('Fernanda');
      expect(result.novos[0].email).toBe('fernanda@email.com');
      expect(result.novos[0].state).toBe('PR');
    });
  });

  describe('confirm', () => {
    it('insere em lote e retorna a contagem', async () => {
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null }); // loadExistingCustomerIndex
      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const result = await service.confirm({
        items: [
          { name: 'Novo Um', email: 'um@email.com' },
          { name: 'Novo Dois', phone: '41999990000' },
        ],
      });

      expect(result).toEqual({ created: 2, skipped: 0 });
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Novo Um', email: 'um@email.com' }),
        expect.objectContaining({ name: 'Novo Dois', phone: '41999990000' }),
      ]);
    });

    it('descarta no confirm quem já foi cadastrado entre o preview e o confirm', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            name: 'Já Existe',
            email: 'existe@email.com',
            cpf: null,
            phone: null,
          },
        ],
        error: null,
      });
      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const result = await service.confirm({
        items: [
          { name: 'Já Existe', email: 'existe@email.com' },
          { name: 'De Fato Novo', email: 'novo@email.com' },
        ],
      });

      expect(result).toEqual({ created: 1, skipped: 1 });
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        expect.objectContaining({ email: 'novo@email.com' }),
      ]);
    });

    it('cai pra inserção linha a linha quando o lote viola o índice único de e-mail (23505)', async () => {
      mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.insert
        .mockResolvedValueOnce({
          error: { code: '23505', message: 'duplicate key' },
        }) // lote
        .mockResolvedValueOnce({ error: null }) // linha 1
        .mockResolvedValueOnce({
          error: { code: '23505', message: 'duplicate key' },
        }); // linha 2

      const result = await service.confirm({
        items: [
          { name: 'Ok', email: 'ok@email.com' },
          { name: 'Colide', email: 'Colide@Email.com' },
        ],
      });

      expect(result).toEqual({ created: 1, skipped: 1 });
    });

    it('rejeita item sem nome antes de tocar o banco', async () => {
      await expect(
        service.confirm({ items: [{ name: '   ', email: 'x@email.com' }] }),
      ).rejects.toThrow('Nome é obrigatório');

      expect(mockSupabase.range).not.toHaveBeenCalled();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });
  });
});
