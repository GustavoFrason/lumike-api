/**
 * AllExceptionsFilter
 * --------------------
 * Filtro global de exceções. Objetivos:
 *  1. Logar toda exceção não tratada com stack trace (via Logger do Nest,
 *     nunca console.*).
 *  2. Nunca vazar mensagem crua de driver/banco (ex: erro do Postgres) para
 *     o cliente — apenas exceções HTTP intencionais (BadRequestException,
 *     NotFoundException etc., já com mensagens pensadas para o usuário)
 *     mantêm sua mensagem original na resposta.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Exceções HTTP conhecidas já carregam mensagem pensada para o cliente.
    // Qualquer outra coisa (erro do Supabase/Postgres, exceção de runtime, etc.)
    // vira uma mensagem genérica — o detalhe completo só vai para o log do servidor.
    const message = isHttpException
      ? exception.getResponse()
      : 'Erro interno do servidor.';

    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(
      `${request.method} ${request.url} -> ${status}: ${
        exception instanceof Error
          ? exception.message
          : JSON.stringify(exception)
      }`,
      stack,
    );

    const body =
      typeof message === 'string' || Array.isArray(message)
        ? { statusCode: status, message, path: request.url }
        : { statusCode: status, path: request.url, ...message };

    response.status(status).json(body);
  }
}
