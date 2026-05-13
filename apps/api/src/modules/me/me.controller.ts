import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  async me(@Req() req: { user: { id: string; fullName: string; email?: string | null } }) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: req.user.id, status: "active" },
      select: {
        tenantId: true,
        tenant: { select: { slug: true, displayName: true } },
        role: { select: { name: true } }
      },
      orderBy: { createdAt: "asc" }
    });

    return {
      data: {
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email ?? undefined
        },
        memberships: memberships.map((m) => ({
          tenantId: m.tenantId,
          tenantSlug: m.tenant.slug,
          tenantDisplayName: m.tenant.displayName,
          roleName: m.role.name
        }))
      }
    };
  }

  @Get("tenants/current")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async currentTenant(@Req() req: { tenantId: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { id: true, slug: true, legalName: true, displayName: true, defaultLocale: true, status: true }
    });
    if (!tenant) {
      return { data: null };
    }

    const branding = await this.prisma.tenantBranding.findUnique({
      where: { tenantId: tenant.id },
      select: { address: true, phone: true, email: true, logoFileId: true }
    });

    return {
      data: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          legalName: tenant.legalName,
          displayName: tenant.displayName,
          defaultLocale: tenant.defaultLocale,
          status: tenant.status
        },
        branding: {
          logoUrl: branding?.logoFileId ? `/api/files/${branding.logoFileId}` : null,
          address: branding?.address ?? null,
          phone: branding?.phone ?? null,
          email: branding?.email ?? null
        }
      }
    };
  }
}
