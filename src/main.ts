import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
