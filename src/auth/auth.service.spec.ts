import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabase: MockSupabaseClient;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  beforeEach(async () => {
    // Reseta o mock de módulo do bcrypt (compartilhado entre testes, ao
    // contrário do mockSupabase/jwtService abaixo, recriados a cada teste)
    // antes de cada um configurar seus próprios mockResolvedValueOnce.
    jest.resetAllMocks();

    process.env.JWT_SECRET = 'test-secret';
    mockSupabase = createMockSupabaseClient();
    jwtService = { signAsync: jest.fn().mockResolvedValue('fake.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('throws UnauthorizedException when no active user is found', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        service.validateUser('nobody@lumilee.com', 'x'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'admin@lumilee.com',
          password: 'hashed',
          role_id: 1,
        },
        error: null,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.validateUser('admin@lumilee.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns the user with its role name when credentials are valid', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'admin@lumilee.com',
          password: 'hashed',
          role_id: 1,
        },
        error: null,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'admin' },
        error: null,
      });

      const result = await service.validateUser('admin@lumilee.com', 'correct');

      expect(result.roleName).toBe('admin');
    });
  });

  describe('login', () => {
    it('returns an access_token and the public user shape on success', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'admin@lumilee.com',
          password: 'hashed',
          role_id: 1,
          name: 'Admin',
        },
        error: null,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockSupabase.single.mockResolvedValueOnce({
        data: { name: 'admin' },
        error: null,
      });

      const result = await service.login('admin@lumilee.com', 'correct');

      expect(result.access_token).toBe('fake.jwt.token');
      expect(result.user).toEqual({
        id: 1,
        email: 'admin@lumilee.com',
        name: 'Admin',
        role: 'admin',
        role_id: 1,
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 1, role: 'admin' }),
        expect.any(Object),
      );
    });

    it('wraps invalid credentials in UnauthorizedException', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(service.login('nobody@lumilee.com', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    it('throws UnauthorizedException when the e-mail is already registered', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 5 },
        error: null,
      });

      await expect(
        service.register({
          name: 'Novo',
          email: 'ja@existe.com',
          senha: '123456',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('creates the user under the customer role and links/creates a customer record', async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // e-mail não existe
        .mockResolvedValueOnce({ data: { id: 9 }, error: null }) // role 'customer' já existe
        .mockResolvedValueOnce({ data: null, error: null }); // nenhum customer prévio com esse e-mail
      (mockedBcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 10,
          name: 'Novo',
          email: 'novo@lumilee.com',
          password: 'hashed-pw',
          role_id: 9,
        },
        error: null,
      });

      const result = await service.register({
        name: 'Novo',
        email: 'novo@lumilee.com',
        senha: '123456',
      });

      expect(result).not.toHaveProperty('password');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({ role_id: 9, is_active: true }),
      );
    });
  });
});
