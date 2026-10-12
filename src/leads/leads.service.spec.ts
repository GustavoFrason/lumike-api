import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('LeadsService', () => {
  let service: LeadsService;
  let mockSupabase: MockSupabaseClient;

  const dto = {
    name: 'Maria Silva',
    email: 'maria@example.com',
    whatsapp: '11999990000',
  };

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('create', () => {
    it('looks up existing leads with .eq() (never an interpolated .or())', async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: {}, error: null });

      await service.create({ ...dto, whatsapp: '1,is_used.eq.false' });

      expect(mockSupabase.or).not.toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('email', dto.email);
      expect(mockSupabase.eq).toHaveBeenCalledWith(
        'whatsapp',
        '1,is_used.eq.false',
      );
    });

    it('returns the existing coupon when the email is already registered', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { coupon_code: 'MARIA123' },
        error: null,
      });

      const result = await service.create(dto);

      expect(result).toMatchObject({
        coupon_code: 'MARIA123',
        is_existing: true,
      });
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });

    it('creates a new lead with a coupon based on the first name', async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: {}, error: null });

      const result = await service.create(dto);

      expect(result.coupon_code).toMatch(/^MARIA\d{3}$/);
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it('does not leak database error details to the public caller', async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'duplicate key', details: 'Key (email)=(x)' },
      });

      const promise = service.create(dto);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.not.toThrow(/duplicate key|Key \(email\)/);
    });
  });
});
