import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { WarrantiesService } from './warranties.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('WarrantiesService', () => {
  let service: WarrantiesService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarrantiesService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<WarrantiesService>(WarrantiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a warranty with status pending', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'w1', status: 'pending' },
        error: null,
      });

      const result = await service.create({
        customer_id: 1,
        product_id: 2,
      } as any);

      expect(result.status).toBe('pending');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('throws InternalServerErrorException on Supabase error', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'db offline' },
      });

      await expect(service.create({} as any)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne', () => {
    it('returns the warranty when found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'w1', status: 'analyzing' },
        error: null,
      });

      const result = await service.findOne('w1');
      expect(result.id).toBe('w1');
    });

    it('throws NotFoundException when not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'not found' },
      });

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('sets finished_at when status moves to finished', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'w1', status: 'finished' },
        error: null,
      });

      await service.update('w1', { status: 'finished' } as any);

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'finished',
          // finished_at é gravado como string ISO (coluna timestamptz),
          // não como objeto Date — ver comentário em warranties.service.ts.
          finished_at: expect.any(String),
        }),
      );
    });

    it('does not set finished_at for other statuses', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'w1', status: 'analyzing' },
        error: null,
      });

      await service.update('w1', { status: 'analyzing' } as any);

      const updatePayload = mockSupabase.update.mock.calls[0][0];
      expect(updatePayload.finished_at).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('aggregates counts by status', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { status: 'pending' },
          { status: 'pending' },
          { status: 'analyzing' },
          { status: 'ready' },
        ],
        error: null,
      });

      const stats = await service.getStats();

      expect(stats).toEqual({
        total: 4,
        pending: 2,
        analyzing: 1,
        factory: 0,
        ready: 1,
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated warranties applying status/customer/origin filters', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: [{ id: 'w1' }],
        error: null,
        count: 1,
      });

      // Filtros chegam como querystring (sempre string), como o controller
      // realmente envia — customer_id é convertido para number no service.
      const result = await service.findAll(1, 50, {
        status: 'pending',
        customer_id: '1',
        origin: 'sold',
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'pending');
      expect(mockSupabase.eq).toHaveBeenCalledWith('customer_id', 1);
      expect(mockSupabase.eq).toHaveBeenCalledWith('origin', 'sold');
    });
  });
});
