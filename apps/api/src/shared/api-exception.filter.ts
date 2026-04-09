import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import type { Request, Response } from "express";

type ErrorCode =
  | "UNAUTHENTICATED"
  | "TENANT_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "SUBSCRIPTION_REQUIRED"
  | "MODULE_DISABLED"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    const requestId = req.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const custom = exception.getResponse();
      if (this.isCustomApiErrorResponse(custom)) {
        return res.status(status).json({ ...(custom as object), meta: { requestId } });
      }

      const { code, message_key } = this.mapHttpException(exception);
      const details = this.extractValidationDetails(exception);

      return res.status(status).json({
        error: {
          code,
          message_key,
          details
        },
        meta: { requestId }
      });
    }

    if (process.env.NODE_ENV !== "production") {
      const err = exception as { stack?: unknown };
      const stack = typeof err?.stack === "string" ? err.stack : undefined;
      Logger.error(exception, stack, `ApiExceptionFilter:${requestId ?? "no-request-id"}`);
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_ERROR" satisfies ErrorCode,
        message_key: "errors.internal"
      },
      meta: { requestId }
    });
  }

  private mapHttpException(exception: HttpException): { code: ErrorCode; message_key: string } {
    if (exception instanceof UnauthorizedException) return { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" };
    if (exception instanceof ForbiddenException) return { code: "PERMISSION_DENIED", message_key: "errors.permissionDenied" };
    if (exception instanceof NotFoundException) return { code: "NOT_FOUND", message_key: "errors.notFound" };
    if (exception instanceof ConflictException) return { code: "CONFLICT", message_key: "errors.conflict" };
    if (exception instanceof BadRequestException) return { code: "VALIDATION_ERROR", message_key: "errors.validationError" };

    if (exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS) return { code: "RATE_LIMITED", message_key: "errors.rateLimited" };

    return { code: "INTERNAL_ERROR", message_key: "errors.internal" };
  }

  private extractValidationDetails(exception: HttpException): Record<string, unknown> | undefined {
    if (!(exception instanceof BadRequestException)) return undefined;
    const response = exception.getResponse();
    if (!response || typeof response !== "object") return undefined;
    const message = (response as { message?: unknown }).message;
    if (!Array.isArray(message)) return undefined;
    return { issues: message };
  }

  private isCustomApiErrorResponse(value: unknown): value is { error: { code: string; message_key: string; details?: unknown } } {
    if (!value || typeof value !== "object") return false;
    if (!("error" in value)) return false;
    const error = (value as { error?: unknown }).error;
    if (!error || typeof error !== "object") return false;
    const code = (error as { code?: unknown }).code;
    const message_key = (error as { message_key?: unknown }).message_key;
    return typeof code === "string" && typeof message_key === "string";
  }
}
