import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Converte TRUST_PROXY no formato que o Express aceita: número de hops
 * ("1"), booleano ("true") ou lista de IPs/sub-redes.
 */
function parseTrustProxy(value: string): number | boolean | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atrás do proxy do Railway, `req.ip` só é o IP real com trust proxy
  // ligado (TRUST_PROXY=1 = confia em 1 hop). Usado como fallback pelo
  // ClientIpThrottlerGuard.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  }

  // Configuração global de validação
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não previstos nos DTOs
      forbidNonWhitelisted: true, // erro se vier campo extra
      transform: true, // transforma payload para os tipos do DTO
    }),
  );

  // Guards de autenticação (JwtAuthGuard) e autorização (RolesGuard) são
  // registrados via APP_GUARD em AppModule — isso os coloca sob o DI do
  // Nest corretamente, em vez de instanciados manualmente aqui.

  // Habilita CORS com origens específicas
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001'];

  const corsOrigin: CustomOrigin = (origin, callback) => {
    // Permite requisições sem origin (ex: Postman, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  };

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  await app.listen(process.env.PORT || 3001);
}
void bootstrap();
