import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  // Stable machine-readable code (e.g. 'EMAIL_NOT_VERIFIED') so clients can
  // branch on the error without parsing the human-readable message string.
  code?: string;
  // Propagates the request ID attached by RequestIdMiddleware so operators
  // can search logs by the same correlation ID the client sees in its
  // X-Request-Id response header.
  requestId?: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || exception.message;
        error = responseObj.error || 'Error';
        code = typeof responseObj.code === 'string' ? responseObj.code : undefined;
      } else {
        message = exception.message;
        error = 'Error';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';

      // Log unexpected errors. The request ID (if present) gives operators
      // a direct search key in the access + app logs.
      this.logger.error(
        `Unexpected error${request.requestId ? ` [req=${request.requestId}]` : ''}: ${exception}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      ...(code ? { code } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
