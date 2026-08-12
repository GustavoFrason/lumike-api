/**
 * Teste de integração leve (módulo isolado + HTTP real via supertest) do
 * rate limit aplicado em /auth/login via @Throttle(). Não sobe o AppModule
 * inteiro (evitaria depender de credenciais reais do Supabase) — só o
 * ThrottlerModule + AuthController, com AuthService mockado.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { Server } from 'http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('Rate limiting em /auth/login', () => {
  // Generic explícito: sem ele, getHttpServer() volta `any` (default do
  // INestApplication) e o supertest reclama de "unsafe argument".
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Limite geral do módulo bem mais alto que o da rota (100/min) — o
      // teste precisa provar que é o @Throttle({ limit: 5 }) do controller
      // que está bloqueando, não o default do módulo.
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest
              .fn()
              .mockRejectedValue(new Error('credenciais inválidas')),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite até 5 tentativas por minuto e bloqueia a 6ª com 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'teste@lumilee.com', senha: 'x' });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'teste@lumilee.com', senha: 'x' });

    expect(blocked.status).toBe(429);
  });
});
