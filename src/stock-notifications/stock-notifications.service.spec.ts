import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StockNotificationsService } from './stock-notifications.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';
import type { AuthUser } from '../auth/types/auth-user.type';

describe('StockNotificationsService', () => {
  let service: StockNotificationsService;
  let mockSupabase: MockSupabaseClient;

  const loggedUser: AuthUser = {
    sub: 42,
    email: 'cliente@example.com',
    role: 'customer',
    role_id: 4,
  };

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockNotificationsService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<StockNotificationsService>(StockNotificationsService);
  });

  /** Sem alerta pendente + insert bem-sucedido. */
  const mockFreshInsert = () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 9 }, error: null });
  };

  it('uses the JWT user and ignores user_id/email sent in the body', async () => {
    mockFreshInsert();

    await service.create(
      { product_id: 1, user_id: 999, email: 'user-logged-in' },
      loggedUser,
    );

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 42, email: 'cliente@example.com' }),
    );
  });

  it('never looks up another customer by the body user_id (no email leak)', async () => {
    await expect(
      service.create({ product_id: 1, user_id: 7, email: 'user-logged-in' }),
    ).rejects.toThrow(BadRequestException);

    expect(mockSupabase.from).not.toHaveBeenCalledWith('customers');
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  it('lets an anonymous visitant create an alert with a valid email', async () => {
    mockFreshInsert();

    const result = await service.create({
      product_id: 1,
      email: 'visitante@example.com',
    });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
        email: 'visitante@example.com',
      }),
    );
    expect(Object.keys(result).sort()).toEqual(['id', 'message']);
    expect(result).toMatchObject({ id: 9 });
  });

  it('does not return the email in the response', async () => {
    mockFreshInsert();

    const result = await service.create({ product_id: 1 }, loggedUser);

    expect(JSON.stringify(result)).not.toContain('cliente@example.com');
    expect(mockSupabase.select).toHaveBeenLastCalledWith('id');
  });

  it('rejects an anonymous request without a valid email', async () => {
    await expect(
      service.create({ product_id: 1, email: 'not-an-email' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not duplicate a pending alert', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 3 },
      error: null,
    });

    const result = await service.create({ product_id: 1 }, loggedUser);

    expect(Object.keys(result)).toEqual(['message']);
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });
});
