import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

type ApiEnvelope =
  | { data: unknown; meta?: Record<string, unknown> }
  | { error: unknown; meta?: Record<string, unknown> }
  | Record<string, unknown>;

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ headers?: Record<string, unknown>; requestId?: string }>();
    const res = http.getResponse<{ setHeader: (name: string, value: string) => void }>();

    const raw = typeof req?.headers?.["x-request-id"] === "string" ? (req.headers["x-request-id"] as string) : undefined;
    const requestId = raw && raw.trim().length ? raw : randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    return next.handle().pipe(
      map((value) => {
        if (!value || typeof value !== "object") return value;
        const envelope = value as ApiEnvelope;
        if (!("data" in envelope) && !("error" in envelope)) return value;
        const meta = typeof envelope.meta === "object" && envelope.meta ? envelope.meta : {};
        if (typeof (meta as Record<string, unknown>).requestId !== "string") {
          (meta as Record<string, unknown>).requestId = requestId;
        }
        return { ...envelope, meta };
      })
    );
  }
}

