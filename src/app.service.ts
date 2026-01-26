/**
 * Serviço principal de exemplo usado pelo AppController.
 * Retorna mensagem simples de status da API.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Lumike API is running 🚀';
  }
}