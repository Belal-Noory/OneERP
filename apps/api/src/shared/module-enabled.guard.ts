import { CanActivate, ExecutionContext, HttpException, Injectable, mixin } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type RequestWithTenant = { tenantId?: string };

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function ModuleEnabledGuard(moduleId: string) {
  @Injectable()
  class Guard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest<RequestWithTenant>();
      const tenantId = req.tenantId ?? null;
      if (!tenantId) {
        throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
      }

      const enabled = await this.prisma.tenantEnabledModule.findFirst({
        where: { tenantId, moduleId, status: "enabled" },
        select: { id: true }
      });
      if (!enabled) {
        throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 403);
      }

      const item = await this.prisma.subscriptionItem.findFirst({
        where: { tenantId, moduleId, endedAt: null },
        select: { status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
      });
      if (item?.lockedAt) {
        throw new HttpException({ error: { code: "MODULE_LOCKED", message_key: "errors.moduleLocked" } }, 403);
      }
      if (!item || item.status !== "active") {
        throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 403);
      }

      if (item.billingCycle === "monthly" && item.currentPeriodEndAt) {
        const now = new Date();
        const grace = item.graceEndsAt ?? addDays(item.currentPeriodEndAt, 3);
        if (now.getTime() > grace.getTime()) {
          throw new HttpException({ error: { code: "MODULE_LOCKED", message_key: "errors.moduleLocked" } }, 403);
        }
      }

      return true;
    }
  }

  return mixin(Guard);
}
