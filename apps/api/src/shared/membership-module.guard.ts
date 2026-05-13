import { CanActivate, ExecutionContext, HttpException, Injectable, mixin } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type RequestWithTenantAndUser = { tenantId?: string; user?: { id: string } };

export function MembershipModuleGuard(moduleId: string) {
  @Injectable()
  class Guard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest<RequestWithTenantAndUser>();
      const tenantId = req.tenantId ?? null;
      const userId = req.user?.id ?? null;
      if (!tenantId) throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
      if (!userId) throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);

      const membership = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { id: true, status: true, role: { select: { name: true } } }
      });
      if (!membership || membership.status !== "active") {
        throw new HttpException({ error: { code: "TENANT_ACCESS_DENIED", message_key: "errors.tenantAccessDenied" } }, 403);
      }
      if (membership.role.name === "Owner") return true;

      const assigned = await this.prisma.membershipEnabledModule.findMany({
        where: { tenantId, membershipId: membership.id },
        select: { moduleId: true }
      });
      if (assigned.length === 0) return true;

      const ok = assigned.some((m) => m.moduleId === moduleId);
      if (!ok) throw new HttpException({ error: { code: "MODULE_ACCESS_DENIED", message_key: "errors.permissionDenied" } }, 403);
      return true;
    }
  }

  return mixin(Guard);
}

