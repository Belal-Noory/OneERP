import { Body, Controller, Get, HttpException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { OwnerGuard } from "../../shared/owner.guard";
import { ApproveModuleRequestDto } from "./dto/approve-module-request.dto";
import { SetPeriodDto } from "./dto/set-period.dto";
import { AddMembershipDto } from "./dto/add-membership.dto";

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function parseIsoDateOrNull(raw?: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function randomPassword(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

@Controller("owner")
@UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
export class OwnerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async me(@Req() req: { user: { id: string; email?: string | null; fullName: string } }) {
    return { data: { id: req.user.id, email: req.user.email ?? null, fullName: req.user.fullName } };
  }

  @Get("tenants")
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        status: true,
        createdAt: true,
        branding: { select: { phone: true, email: true, address: true } },
        memberships: {
          where: { status: "active", role: { is: { name: "Owner" } } },
          select: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
          take: 1,
          orderBy: { createdAt: "asc" }
        },
        enabledModules: { select: { moduleId: true, status: true, enabledAt: true, disabledAt: true } },
        subscription: {
          select: {
            id: true,
            items: {
              select: {
                moduleId: true,
                status: true,
                subscriptionType: true,
                billingCycle: true,
                priceAmount: true,
                priceCurrency: true,
                currentPeriodEndAt: true,
                graceEndsAt: true,
                lockedAt: true,
                module: { select: { nameKey: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      data: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        legalName: t.legalName,
        displayName: t.displayName,
        status: t.status,
        createdAt: t.createdAt,
        branding: t.branding ?? null,
        owner: t.memberships[0]?.user ?? null,
        enabledModules: t.enabledModules.map((m) => ({ moduleId: m.moduleId, status: m.status, enabledAt: m.enabledAt, disabledAt: m.disabledAt })),
        subscriptionItems: (t.subscription?.items ?? []).map((i) => ({
          moduleId: i.moduleId,
          status: i.status,
          subscriptionType: i.subscriptionType,
          billingCycle: i.billingCycle,
          priceAmount: i.priceAmount?.toString() ?? null,
          priceCurrency: i.priceCurrency ?? null,
          currentPeriodEndAt: i.currentPeriodEndAt,
          graceEndsAt: i.graceEndsAt,
          lockedAt: i.lockedAt,
          moduleNameKey: i.module.nameKey
        }))
      }))
    };
  }

  @Get("tenants/:tenantId")
  async getTenant(@Param("tenantId") tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        status: true,
        createdAt: true,
        branding: { select: { phone: true, email: true, address: true } },
        memberships: {
          where: { status: "active" },
          select: { id: true, status: true, createdAt: true, user: { select: { id: true, fullName: true, email: true, phone: true } }, role: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" }
        },
        enabledModules: { select: { moduleId: true, status: true, enabledAt: true, disabledAt: true, module: { select: { nameKey: true } } } },
        roles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        subscription: {
          select: {
            id: true,
            items: {
              where: { endedAt: null },
              select: {
                moduleId: true,
                status: true,
                subscriptionType: true,
                billingCycle: true,
                priceAmount: true,
                priceCurrency: true,
                currentPeriodStartAt: true,
                currentPeriodEndAt: true,
                graceEndsAt: true,
                lockedAt: true,
                approvedAt: true,
                supportEndsAt: true,
                module: { select: { nameKey: true } }
              },
              orderBy: { startedAt: "asc" }
            }
          }
        }
      }
    });

    if (!tenant) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: tenant.id,
        slug: tenant.slug,
        legalName: tenant.legalName,
        displayName: tenant.displayName,
        status: tenant.status,
        createdAt: tenant.createdAt,
        branding: tenant.branding ?? null,
        owner: tenant.memberships.find((m) => m.role.name === "Owner")?.user ?? null,
        roles: tenant.roles.map((r) => ({ id: r.id, name: r.name })),
        memberships: tenant.memberships.map((m) => ({
          id: m.id,
          status: m.status,
          createdAt: m.createdAt,
          user: m.user,
          role: m.role
        })),
        enabledModules: tenant.enabledModules.map((m) => ({ moduleId: m.moduleId, status: m.status, enabledAt: m.enabledAt, disabledAt: m.disabledAt, moduleNameKey: m.module.nameKey })),
        subscriptionItems: (tenant.subscription?.items ?? []).map((i) => ({
          moduleId: i.moduleId,
          moduleNameKey: i.module.nameKey,
          status: i.status,
          subscriptionType: i.subscriptionType,
          billingCycle: i.billingCycle,
          priceAmount: i.priceAmount?.toString() ?? null,
          priceCurrency: i.priceCurrency ?? null,
          currentPeriodStartAt: i.currentPeriodStartAt,
          currentPeriodEndAt: i.currentPeriodEndAt,
          graceEndsAt: i.graceEndsAt,
          lockedAt: i.lockedAt,
          approvedAt: i.approvedAt,
          supportEndsAt: i.supportEndsAt
        }))
      }
    };
  }

  @Post("tenants/:tenantId/memberships")
  async addMembership(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Body() body: AddMembershipDto) {
    const email = body.email.trim().toLowerCase();
    const fullName = (body.fullName ?? "").trim();
    const roleName = body.roleName;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const role = await this.prisma.role.findFirst({ where: { tenantId, name: roleName }, select: { id: true, name: true } });
    if (!role) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const result = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email }, select: { id: true, fullName: true, email: true } });
      const user = existingUser
        ? await tx.user.update({
            where: { email },
            data: fullName ? { fullName } : {},
            select: { id: true, fullName: true, email: true }
          })
        : await tx.user.create({
            data: { email, fullName: fullName || email.split("@")[0], passwordHash: await argon2.hash(randomPassword(16)) },
            select: { id: true, fullName: true, email: true }
          });

      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        update: { status: "active", roleId: role.id },
        create: { tenantId, userId: user.id, roleId: role.id, status: "active" },
        select: { id: true }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.membership.upsert",
          entityType: "membership",
          entityId: membership.id,
          metadataJson: { email, roleName }
        }
      });

      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.passwordResetToken.create({ data: { userId: user.id, tenantId, tokenHash, expiresAt } });
      const inviteUrl = `${process.env.PUBLIC_WEB_URL ?? "http://localhost:3000"}/invite?token=${token}`;

      return { user, inviteUrl };
    });

    return { data: { success: true, user: result.user, inviteUrl: result.inviteUrl } };
  }

  @Get("module-requests")
  async listModuleRequests() {
    const items = await this.prisma.subscriptionItem.findMany({
      where: { status: "requested", endedAt: null },
      select: {
        id: true,
        tenantId: true,
        moduleId: true,
        status: true,
        startedAt: true,
        tenant: { select: { slug: true, displayName: true, legalName: true } },
        module: { select: { id: true, nameKey: true, category: true, icon: true } }
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }]
    });

    return {
      data: items.map((i) => ({
        id: i.id,
        tenantId: i.tenantId,
        tenantSlug: i.tenant.slug,
        tenantDisplayName: i.tenant.displayName,
        tenantLegalName: i.tenant.legalName,
        moduleId: i.moduleId,
        moduleNameKey: i.module.nameKey,
        moduleCategory: i.module.category,
        moduleIcon: i.module.icon,
        status: i.status,
        requestedAt: i.startedAt
      }))
    };
  }

  @Post("module-requests/:tenantId/:moduleId/approve")
  async approveModuleRequest(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: ApproveModuleRequestDto
  ) {
    const now = new Date();
    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (!mod.isActive) throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const subscriptionType = body.subscriptionType;
    const isMonthly = subscriptionType === "online_monthly";
    const billingCycle = isMonthly ? "monthly" : "one_time";
    const defaultAmount = subscriptionType === "online_monthly" ? "40" : subscriptionType === "offline_no_changes" ? "1000" : "2000";
    const priceAmount = new Prisma.Decimal((body.priceAmount ?? defaultAmount).trim());
    const priceCurrency = (body.priceCurrency ?? "USD").trim() || "USD";

    const currentPeriodStartAt = isMonthly ? now : null;
    const configuredPeriodEnd = isMonthly ? parseIsoDateOrNull(body.currentPeriodEndAt) : null;
    const currentPeriodEndAt = isMonthly ? (configuredPeriodEnd ?? addDays(now, 30)) : null;
    const graceEndsAt = isMonthly && currentPeriodEndAt ? addDays(currentPeriodEndAt, 3) : null;
    const supportEndsAt = subscriptionType === "offline_with_changes" ? addMonths(now, 3) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionItem.upsert({
        where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
        update: {
          status: "active",
          endedAt: null,
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt,
          currentPeriodEndAt,
          graceEndsAt,
          lockedAt: null,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt
        },
        create: {
          tenantId,
          subscriptionId: subscription.id,
          moduleId,
          status: "active",
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt: currentPeriodStartAt ?? undefined,
          currentPeriodEndAt: currentPeriodEndAt ?? undefined,
          graceEndsAt: graceEndsAt ?? undefined,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt: supportEndsAt ?? undefined
        }
      });

      await tx.tenantEnabledModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        update: { status: "enabled", disabledAt: null, enabledAt: now },
        create: { tenantId, moduleId, status: "enabled", enabledAt: now }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.module.approve",
          entityType: "module",
          entityId: moduleId,
          metadataJson: { subscriptionType, billingCycle, priceAmount: priceAmount.toString(), priceCurrency }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/activate")
  async activateSubscription(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: ApproveModuleRequestDto
  ) {
    const now = new Date();
    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (!mod.isActive) throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const subscriptionType = body.subscriptionType;
    const isMonthly = subscriptionType === "online_monthly";
    const billingCycle = isMonthly ? "monthly" : "one_time";
    const defaultAmount = subscriptionType === "online_monthly" ? "40" : subscriptionType === "offline_no_changes" ? "1000" : "2000";
    const priceAmount = new Prisma.Decimal((body.priceAmount ?? defaultAmount).trim());
    const priceCurrency = (body.priceCurrency ?? "USD").trim() || "USD";

    const currentPeriodStartAt = isMonthly ? now : null;
    const configuredPeriodEnd = isMonthly ? parseIsoDateOrNull(body.currentPeriodEndAt) : null;
    const currentPeriodEndAt = isMonthly ? (configuredPeriodEnd ?? addDays(now, 30)) : null;
    const graceEndsAt = isMonthly && currentPeriodEndAt ? addDays(currentPeriodEndAt, 3) : null;
    const supportEndsAt = subscriptionType === "offline_with_changes" ? addMonths(now, 3) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionItem.upsert({
        where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
        update: {
          status: "active",
          endedAt: null,
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt,
          currentPeriodEndAt,
          graceEndsAt,
          lockedAt: null,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt
        },
        create: {
          tenantId,
          subscriptionId: subscription.id,
          moduleId,
          status: "active",
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt: currentPeriodStartAt ?? undefined,
          currentPeriodEndAt: currentPeriodEndAt ?? undefined,
          graceEndsAt: graceEndsAt ?? undefined,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt: supportEndsAt ?? undefined
        }
      });

      await tx.tenantEnabledModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        update: { status: "enabled", disabledAt: null, enabledAt: now },
        create: { tenantId, moduleId, status: "enabled", enabledAt: now }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.activate",
          entityType: "module",
          entityId: moduleId,
          metadataJson: { subscriptionType, billingCycle, priceAmount: priceAmount.toString(), priceCurrency }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/lock")
  async lockSubscription(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Param("moduleId") moduleId: string) {
    const now = new Date();
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.subscriptionItem.update({ where: { id: item.id }, data: { status: "locked", lockedAt: now } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "owner.subscription.lock", entityType: "subscriptionItem", entityId: item.id, metadataJson: { moduleId } }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/unlock")
  async unlockSubscription(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Param("moduleId") moduleId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.subscriptionItem.update({ where: { id: item.id }, data: { status: "active", lockedAt: null } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "owner.subscription.unlock", entityType: "subscriptionItem", entityId: item.id, metadataJson: { moduleId } }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/set-period")
  async setPeriod(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: SetPeriodDto
  ) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const nextEnd = parseIsoDateOrNull(body.currentPeriodEndAt);
    if (!nextEnd) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const nextGrace = addDays(nextEnd, 3);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true, billingCycle: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (item.billingCycle !== "monthly") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

      await tx.subscriptionItem.update({
        where: { id: item.id },
        data: { currentPeriodEndAt: nextEnd, graceEndsAt: nextGrace }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.setPeriod",
          entityType: "subscriptionItem",
          entityId: item.id,
          metadataJson: { moduleId, currentPeriodEndAt: nextEnd.toISOString() }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/mark-paid")
  async markPaid(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body?: SetPeriodDto
  ) {
    const now = new Date();
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const configuredPeriodEnd = parseIsoDateOrNull(body?.currentPeriodEndAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true, billingCycle: true, currentPeriodEndAt: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (item.billingCycle !== "monthly") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
      }

      const base = item.currentPeriodEndAt && item.currentPeriodEndAt.getTime() > now.getTime() ? item.currentPeriodEndAt : now;
      const nextEnd = item.billingCycle === "monthly" ? (configuredPeriodEnd ?? addDays(base, 30)) : item.currentPeriodEndAt;
      const nextGrace = item.billingCycle === "monthly" && nextEnd ? addDays(nextEnd, 3) : null;

      const updatedItem = await tx.subscriptionItem.update({
        where: { id: item.id },
        data: {
          status: "active",
          lockedAt: null,
          currentPeriodStartAt: item.billingCycle === "monthly" ? now : undefined,
          currentPeriodEndAt: nextEnd ?? undefined,
          graceEndsAt: nextGrace ?? undefined
        },
        select: { id: true, moduleId: true, status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.markPaid",
          entityType: "subscriptionItem",
          entityId: item.id,
          metadataJson: { moduleId, billingCycle: item.billingCycle, currentPeriodEndAt: nextEnd?.toISOString() ?? null }
        }
      });

      return updatedItem;
    });

    return { data: { success: true, subscriptionItem: updated } };
  }
}
