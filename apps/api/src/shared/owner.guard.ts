import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";

type RequestWithUser = { user?: { email?: string | null } };

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const email = (req.user?.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const fromSingle = (process.env.OWNER_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const fromList = (process.env.OWNER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);

    const allow = new Set([fromSingle, ...fromList].filter(Boolean));
    if (!allow.has(email)) {
      throw new HttpException({ error: { code: "FORBIDDEN", message_key: "errors.permissionDenied" } }, 403);
    }
    return true;
  }
}

