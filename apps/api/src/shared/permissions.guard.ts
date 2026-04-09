import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required || required.length === 0) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<{ user?: { id: string }; tenantId?: string }>();
    const userId = req.user?.id;
    const tenantId = req.tenantId;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }
    if (!tenantId) {
      throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { roleId: true, status: true }
    });
    if (!membership || membership.status !== "active") {
      throw new HttpException({ error: { code: "TENANT_ACCESS_DENIED", message_key: "errors.tenantAccessDenied" } }, 403);
    }

    const role = await this.prisma.role.findUnique({ where: { id: membership.roleId }, select: { name: true } });
    if (role?.name === "Owner") return true;

    const permissions = await this.prisma.rolePermission.findMany({
      where: { tenantId, roleId: membership.roleId },
      select: { permissionKey: true }
    });
    const set = new Set(permissions.map((p) => p.permissionKey));
    const ok = required.every((p) => set.has(p));
    if (!ok) {
      throw new HttpException({ error: { code: "PERMISSION_DENIED", message_key: "errors.permissionDenied" } }, 403);
    }
    return true;
  }
}
