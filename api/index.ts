// lumike-api/api/index.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const server = express();

async function bootstrap() {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    // Reaplique as configurações globais se necessário (pipes, guards, etc.)
    await app.init();
}

bootstrap();

export default server;
