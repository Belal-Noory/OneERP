import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      headers: Record<string, unknown>;
      user?: { id: string };
      tenantId?: string;
    }>();

    const tenantId = typeof req.headers["x-tenant-id"] === "string" ? (req.headers["x-tenant-id"] as string) : null;
    if (!tenantId) {
      throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, status: true }
    });
    if (!membership || membership.status !== "active") {
      throw new HttpException({ error: { code: "TENANT_ACCESS_DENIED", message_key: "errors.tenantAccessDenied" } }, 403);
    }

    req.tenantId = tenantId;
    return true;
  }
}

