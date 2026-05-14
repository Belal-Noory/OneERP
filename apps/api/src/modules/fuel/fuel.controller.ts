import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { MembershipModuleGuard } from "../../shared/membership-module.guard";
import {
  CloseFuelShiftDto,
  CreateFuelReceivingDto,
  CreateFuelSaleDto,
  CreateNozzleDto,
  CreatePumpDto,
  CreateTankDipDto,
  CreateTankDto,
  OpenFuelShiftDto,
  UpdateFuelPriceDto,
  UpdateFuelSaleDto,
  UpdateNozzleDto,
  UpdatePumpDto,
  UpdateTankDto
} from "./dto/fuel.dto";

@Controller("fuel")
@UseGuards(AuthGuard("jwt"), TenantGuard, ModuleEnabledGuard("fuel"), MembershipModuleGuard("fuel"), PermissionsGuard)
export class FuelController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureFuelPriceTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "FuelPrice" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "fuelType" TEXT NOT NULL, "pricePerUnit" DECIMAL(14,2) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedByUserId" TEXT, CONSTRAINT "FuelPrice_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "FuelPrice_tenantId_fuelType_key" ON "FuelPrice"("tenantId","fuelType")'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "FuelPrice_tenantId_idx" ON "FuelPrice"("tenantId")');
  }

  private async ensureFuelCreditInvoiceTables(): Promise<void> {
    await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "FuelCreditInvoice" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "invoiceNumber" TEXT NOT NULL, "month" TEXT, "periodFrom" TIMESTAMP(3), "periodTo" TIMESTAMP(3), "salesCount" INTEGER NOT NULL DEFAULT 0, "totalVolume" DECIMAL(14,2) NOT NULL DEFAULT 0, "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT \'issued\', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "FuelCreditInvoice_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "FuelCreditInvoice_tenantId_invoiceNumber_key" ON "FuelCreditInvoice"("tenantId","invoiceNumber")'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "FuelCreditInvoice_tenantId_customerId_idx" ON "FuelCreditInvoice"("tenantId","customerId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "FuelCreditInvoice_tenantId_month_idx" ON "FuelCreditInvoice"("tenantId","month")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "FuelCreditInvoicePayment" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "invoiceNumber" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "method" TEXT NOT NULL, "note" TEXT, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "FuelCreditInvoicePayment_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "FuelCreditInvoicePayment_tenantId_invoiceNumber_idx" ON "FuelCreditInvoicePayment"("tenantId","invoiceNumber")'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "FuelCreditInvoicePayment_tenantId_createdAt_idx" ON "FuelCreditInvoicePayment"("tenantId","createdAt")'
    );
  }

  // --- TANKS ---

  @Get("tanks")
  @RequirePermissions("fuel.tanks.view")
  async listTanks(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const tanks = await this.prisma.fuelTank.findMany({
      where: { tenantId },
      orderBy: { name: "asc" }
    });
    return { data: tanks.map((t: any) => ({ ...t, capacity: t.capacity.toString(), currentVolume: t.currentVolume.toString() })) };
  }

  @Get("tanks/:id")
  @RequirePermissions("fuel.tanks.view")
  async getTank(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const tank = await this.prisma.fuelTank.findFirst({
      where: { tenantId, id },
      include: {
        receivings: { orderBy: { receivedAt: "desc" }, take: 50, include: { supplier: { select: { id: true, name: true } } } },
        dips: { orderBy: { recordedAt: "desc" }, take: 50, include: { recordedBy: { select: { id: true, fullName: true } } } }
      }
    });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        ...tank,
        capacity: tank.capacity.toString(),
        currentVolume: tank.currentVolume.toString(),
        receivings: tank.receivings.map((r: any) => ({
          ...r,
          volumeReceived: r.volumeReceived.toString(),
          pricePerUnit: r.pricePerUnit.toString(),
          totalCost: r.totalCost.toString()
        })),
        dips: tank.dips.map((d: any) => ({
          ...d,
          measuredVolume: d.measuredVolume.toString(),
          systemVolume: d.systemVolume.toString(),
          difference: d.difference.toString()
        }))
      }
    };
  }

  @Post("tanks")
  @RequirePermissions("fuel.tanks.manage")
  async createTank(@Req() req: { tenantId: string }, @Body() body: CreateTankDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.fuelTank.findFirst({
      where: { tenantId, name: body.name.trim() }
    });
    if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);

    const tank = await this.prisma.fuelTank.create({
      data: {
        tenantId,
        name: body.name.trim(),
        fuelType: body.fuelType.trim(),
        capacity: new Decimal(body.capacity),
        status: body.status || "active"
      }
    });
    return { data: { id: tank.id } };
  }

  @Patch("tanks/:id")
  @RequirePermissions("fuel.tanks.manage")
  async updateTank(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdateTankDto) {
    const tenantId = req.tenantId;
    const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id } });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.name && body.name.trim() !== tank.name) {
      const existing = await this.prisma.fuelTank.findFirst({ where: { tenantId, name: body.name.trim(), id: { not: id } } });
      if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);
    }

    await this.prisma.fuelTank.update({
      where: { id },
      data: {
        name: body.name ? body.name.trim() : undefined,
        fuelType: body.fuelType ? body.fuelType.trim() : undefined,
        capacity: body.capacity !== undefined ? new Decimal(body.capacity) : undefined,
        status: body.status
      }
    });
    return { data: { success: true } };
  }

  @Delete("tanks/:id")
  @RequirePermissions("fuel.tanks.manage")
  async deleteTank(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id } });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const inUse = await this.prisma.fuelNozzle.count({ where: { tenantId, tankId: id } });
    if (inUse > 0) throw new HttpException({ error: { code: "IN_USE", message_key: "errors.tankInUse" } }, 400);

    await this.prisma.fuelTank.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Post("tanks/:id/receivings")
  @RequirePermissions("fuel.tanks.manage")
  async receiveFuel(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateFuelReceivingDto) {
    const tenantId = req.tenantId;
    const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id } });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.supplierId) {
      const supplier = await this.prisma.shopSupplier.findFirst({ where: { tenantId, id: body.supplierId } });
      if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const totalCost = new Decimal(body.volumeReceived).mul(new Decimal(body.pricePerUnit));

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.fuelReceiving.create({
        data: {
          tenantId,
          tankId: id,
          supplierId: body.supplierId || null,
          volumeReceived: body.volumeReceived,
          pricePerUnit: body.pricePerUnit,
          totalCost,
          referenceNumber: body.referenceNumber || null
        }
      });

      await tx.fuelTank.update({
        where: { id },
        data: { currentVolume: { increment: body.volumeReceived } }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.receiving.create",
          metadataJson: { tankId: id, volumeReceived: body.volumeReceived, totalCost }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("tanks/:id/dips")
  @RequirePermissions("fuel.tanks.manage")
  async recordDip(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateTankDipDto) {
    const tenantId = req.tenantId;
    const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id } });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const measured = new Decimal(body.measuredVolume);
    const diff = measured.sub(tank.currentVolume);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.fuelTankDip.create({
        data: {
          tenantId,
          tankId: id,
          measuredVolume: measured,
          systemVolume: tank.currentVolume,
          difference: diff,
          reason: body.reason || null,
          recordedByUserId: req.user.id
        }
      });

      await tx.fuelTank.update({
        where: { id },
        data: { currentVolume: measured }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.dip.record",
          metadataJson: { tankId: id, measuredVolume: measured, systemVolume: tank.currentVolume, diff }
        }
      });
    });

    return { data: { success: true } };
  }

  // --- PUMPS ---

  @Get("pumps")
  @RequirePermissions("fuel.pumps.view")
  async listPumps(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const pumps = await this.prisma.fuelPump.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        nozzles: {
          orderBy: { name: "asc" },
          include: { tank: { select: { name: true, fuelType: true } } }
        }
      }
    });

    return {
      data: pumps.map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        nozzles: p.nozzles.map((n: any) => ({
          id: n.id,
          name: n.name,
          tankId: n.tankId,
          tankName: n.tank.name,
          fuelType: n.tank.fuelType,
          currentTotalizerReading: n.currentTotalizerReading.toString(),
          status: n.status
        }))
      }))
    };
  }

  @Post("pumps")
  @RequirePermissions("fuel.pumps.manage")
  async createPump(@Req() req: { tenantId: string }, @Body() body: CreatePumpDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.fuelPump.findFirst({ where: { tenantId, name: body.name.trim() } });
    if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);

    const pump = await this.prisma.fuelPump.create({
      data: { tenantId, name: body.name.trim(), status: body.status || "active" }
    });
    return { data: { id: pump.id } };
  }

  @Patch("pumps/:id")
  @RequirePermissions("fuel.pumps.manage")
  async updatePump(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdatePumpDto) {
    const tenantId = req.tenantId;
    const pump = await this.prisma.fuelPump.findFirst({ where: { tenantId, id } });
    if (!pump) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.name && body.name.trim() !== pump.name) {
      const existing = await this.prisma.fuelPump.findFirst({ where: { tenantId, name: body.name.trim(), id: { not: id } } });
      if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);
    }

    await this.prisma.fuelPump.update({
      where: { id },
      data: { name: body.name ? body.name.trim() : undefined, status: body.status }
    });
    return { data: { success: true } };
  }

  @Delete("pumps/:id")
  @RequirePermissions("fuel.pumps.manage")
  async deletePump(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const pump = await this.prisma.fuelPump.findFirst({ where: { tenantId, id } });
    if (!pump) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.fuelPump.delete({ where: { id } });
    return { data: { success: true } };
  }

  // --- NOZZLES ---

  @Post("nozzles")
  @RequirePermissions("fuel.pumps.manage")
  async createNozzle(@Req() req: { tenantId: string }, @Body() body: CreateNozzleDto) {
    const tenantId = req.tenantId;
    const pump = await this.prisma.fuelPump.findFirst({ where: { tenantId, id: body.pumpId } });
    if (!pump) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id: body.tankId } });
    if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const existing = await this.prisma.fuelNozzle.findFirst({ where: { tenantId, pumpId: body.pumpId, name: body.name.trim() } });
    if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);

    const nozzle = await this.prisma.fuelNozzle.create({
      data: {
        tenantId,
        pumpId: body.pumpId,
        tankId: body.tankId,
        name: body.name.trim(),
        currentTotalizerReading: new Decimal(body.currentTotalizerReading ?? 0),
        status: body.status || "active"
      }
    });
    return { data: { id: nozzle.id } };
  }

  @Patch("nozzles/:id")
  @RequirePermissions("fuel.pumps.manage")
  async updateNozzle(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdateNozzleDto) {
    const tenantId = req.tenantId;
    const nozzle = await this.prisma.fuelNozzle.findFirst({ where: { tenantId, id } });
    if (!nozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.name && body.name.trim() !== nozzle.name) {
      const existing = await this.prisma.fuelNozzle.findFirst({ where: { tenantId, pumpId: nozzle.pumpId, name: body.name.trim(), id: { not: id } } });
      if (existing) throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.nameAlreadyExists" } }, 400);
    }

    if (body.tankId && body.tankId !== nozzle.tankId) {
      const tank = await this.prisma.fuelTank.findFirst({ where: { tenantId, id: body.tankId } });
      if (!tank) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    await this.prisma.fuelNozzle.update({
      where: { id },
      data: {
        name: body.name ? body.name.trim() : undefined,
        tankId: body.tankId,
        currentTotalizerReading: body.currentTotalizerReading !== undefined ? new Decimal(body.currentTotalizerReading) : undefined,
        status: body.status
      }
    });
    return { data: { success: true } };
  }

  @Delete("nozzles/:id")
  @RequirePermissions("fuel.pumps.manage")
  async deleteNozzle(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const nozzle = await this.prisma.fuelNozzle.findFirst({ where: { tenantId, id } });
    if (!nozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.fuelNozzle.delete({ where: { id } });
    return { data: { success: true } };
  }

  // --- SHIFTS ---

  @Get("shifts")
  @RequirePermissions("fuel.shifts.view")
  async listShifts(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const shifts = await this.prisma.fuelShift.findMany({
      where: { tenantId },
      orderBy: { openedAt: "desc" },
      include: {
        openedBy: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
        readings: {
          include: {
            nozzle: { select: { id: true, name: true, currentTotalizerReading: true, tank: { select: { id: true, name: true, fuelType: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      take: 50
    });

    return {
      data: shifts.map((s: any) => ({
        ...s,
        expectedRevenue: s.expectedRevenue.toString(),
        actualRevenue: s.actualRevenue.toString(),
        difference: s.difference.toString(),
        readings: s.readings.map((r: any) => ({
          ...r,
          nozzle: { ...r.nozzle, currentTotalizerReading: r.nozzle.currentTotalizerReading.toString() },
          openingReading: r.openingReading.toString(),
          closingReading: r.closingReading?.toString() ?? null,
          totalVolume: r.totalVolume.toString(),
          pricePerUnit: r.pricePerUnit.toString(),
          totalAmount: r.totalAmount.toString()
        }))
      }))
    };
  }

  @Get("shifts/:id/report")
  @RequirePermissions("fuel.reports.view")
  async shiftReport(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const shift = await this.prisma.fuelShift.findFirst({
      where: { tenantId, id },
      include: {
        openedBy: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
        readings: {
          include: {
            nozzle: { select: { id: true, name: true, tank: { select: { id: true, name: true, fuelType: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!shift) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const [byPayment, byNozzle, sales] = await Promise.all([
      this.prisma.fuelSale.groupBy({
        by: ["paymentMethod"],
        where: { tenantId, shiftId: shift.id, status: "posted" },
        _sum: { totalAmount: true, volume: true },
        _count: { _all: true }
      }),
      this.prisma.fuelSale.groupBy({
        by: ["nozzleId"],
        where: { tenantId, shiftId: shift.id, status: "posted" },
        _sum: { totalAmount: true, volume: true },
        _count: { _all: true }
      }),
      this.prisma.fuelSale.findMany({
        where: { tenantId, shiftId: shift.id, status: "posted" },
        orderBy: { createdAt: "asc" },
        take: 5000,
        select: {
          id: true,
          createdAt: true,
          nozzleId: true,
          volume: true,
          pricePerUnit: true,
          totalAmount: true,
          paymentMethod: true,
          driverName: true,
          licensePlate: true,
          customer: { select: { id: true, name: true } },
          nozzle: { select: { name: true, tank: { select: { fuelType: true } } } }
        }
      })
    ]);

    const nozzleIds = byNozzle.map((r: any) => r.nozzleId);
    const nozzleRefs = nozzleIds.length
      ? await this.prisma.fuelNozzle.findMany({
          where: { tenantId, id: { in: nozzleIds } },
          select: { id: true, name: true, tank: { select: { id: true, name: true, fuelType: true } } }
        })
      : [];
    const nozzleMap = new Map<string, any>(nozzleRefs.map((n: any) => [n.id, n]));

    const totals = sales.reduce(
      (acc: { volume: Decimal; totalAmount: Decimal }, s: any) => ({ volume: acc.volume.add(s.volume), totalAmount: acc.totalAmount.add(s.totalAmount) }),
      { volume: new Decimal(0), totalAmount: new Decimal(0) }
    );

    return {
      data: {
        shift: {
          id: shift.id,
          status: shift.status,
          openedAt: shift.openedAt,
          closedAt: shift.closedAt,
          openedBy: shift.openedBy,
          closedBy: shift.closedBy,
          expectedRevenue: shift.expectedRevenue.toString(),
          actualRevenue: shift.actualRevenue.toString(),
          difference: shift.difference.toString(),
          note: shift.note
        },
        totals: { salesCount: sales.length, volume: totals.volume.toString(), totalAmount: totals.totalAmount.toString() },
        byPaymentMethod: byPayment.map((p: any) => ({
          paymentMethod: p.paymentMethod,
          salesCount: p._count._all,
          volume: (p._sum.volume ?? new Decimal(0)).toString(),
          totalAmount: (p._sum.totalAmount ?? new Decimal(0)).toString()
        })),
        byNozzle: byNozzle.map((r: any) => {
          const ref = nozzleMap.get(r.nozzleId);
          return {
            nozzleId: r.nozzleId,
            nozzleName: ref?.name ?? r.nozzleId,
            tankName: ref?.tank?.name ?? null,
            fuelType: ref?.tank?.fuelType ?? null,
            salesCount: r._count._all,
            volume: (r._sum.volume ?? new Decimal(0)).toString(),
            totalAmount: (r._sum.totalAmount ?? new Decimal(0)).toString()
          };
        }),
        readings: shift.readings.map((r: any) => ({
          id: r.id,
          nozzleId: r.nozzleId,
          nozzle: r.nozzle,
          openingReading: r.openingReading.toString(),
          closingReading: r.closingReading?.toString() ?? null,
          totalVolume: r.totalVolume.toString(),
          pricePerUnit: r.pricePerUnit.toString(),
          totalAmount: r.totalAmount.toString()
        })),
        sales: sales.map((s: any) => ({
          ...s,
          volume: s.volume.toString(),
          pricePerUnit: s.pricePerUnit.toString(),
          totalAmount: s.totalAmount.toString()
        }))
      }
    };
  }

  @Post("shifts/open")
  @RequirePermissions("fuel.shifts.manage")
  async openShift(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: OpenFuelShiftDto) {
    const tenantId = req.tenantId;
    const uniqueNozzleIds = Array.from(new Set((body.nozzles ?? []).map((n) => n.nozzleId)));
    if (uniqueNozzleIds.length === 0) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const nozzles = await this.prisma.fuelNozzle.findMany({
      where: { tenantId, id: { in: uniqueNozzleIds }, status: "active" }
    });
    if (nozzles.length !== uniqueNozzleIds.length) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const openShiftCount = await this.prisma.fuelShift.count({ where: { tenantId, status: "open" } });
    if (openShiftCount > 0) {
      throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);
    }

    const nozzlesMap = new Map<string, any>(nozzles.map((n: any) => [n.id, n]));
    const byNozzle = new Map<string, any>(body.nozzles.map((n: any) => [n.nozzleId, n]));

    const shift = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.fuelShift.create({
        data: { tenantId, status: "open", openedByUserId: req.user.id, note: body.note || null }
      });

      await tx.fuelShiftNozzleReading.createMany({
        data: uniqueNozzleIds.map((nozzleId) => {
          const nozzleInput = byNozzle.get(nozzleId)!;
          const nozzle = nozzlesMap.get(nozzleId)!;
          return {
            tenantId,
            shiftId: created.id,
            nozzleId,
            openingReading: nozzle.currentTotalizerReading,
            pricePerUnit: new Decimal(nozzleInput.pricePerUnit)
          };
        })
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.shift.open",
          metadataJson: { shiftId: created.id, nozzleIds: uniqueNozzleIds }
        }
      });

      return created;
    });

    return { data: { id: shift.id } };
  }

  @Post("shifts/:id/close")
  @RequirePermissions("fuel.shifts.manage")
  async closeShift(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") id: string,
    @Body() body: CloseFuelShiftDto
  ) {
    const tenantId = req.tenantId;
    const shift = await this.prisma.fuelShift.findFirst({
      where: { tenantId, id },
      include: { readings: true }
    });
    if (!shift) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (shift.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    type CloseNozzleInput = { nozzleId: string; closingReading: number | string };
    const closingByNozzle = new Map<string, CloseNozzleInput>((body.nozzles ?? []).map((n: CloseNozzleInput) => [n.nozzleId, n]));
    if (!shift.readings.every((r: { nozzleId: string }) => closingByNozzle.has(r.nozzleId))) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    let expectedRevenue = new Decimal(0);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const reading of shift.readings) {
        const close = closingByNozzle.get(reading.nozzleId)!;
        const closingReading = new Decimal(close.closingReading);
        if (closingReading.lessThan(reading.openingReading)) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
        const totalVolume = closingReading.sub(reading.openingReading);
        const totalAmount = totalVolume.mul(reading.pricePerUnit);
        expectedRevenue = expectedRevenue.add(totalAmount);

        await tx.fuelShiftNozzleReading.update({
          where: { id: reading.id },
          data: {
            closingReading,
            totalVolume,
            totalAmount
          }
        });

        await tx.fuelNozzle.update({
          where: { id: reading.nozzleId },
          data: { currentTotalizerReading: closingReading }
        });
      }

      const actualRevenue = new Decimal(body.actualRevenue);
      const difference = actualRevenue.sub(expectedRevenue);
      await tx.fuelShift.update({
        where: { id: shift.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedByUserId: req.user.id,
          expectedRevenue,
          actualRevenue,
          difference,
          note: body.note ?? shift.note
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.shift.close",
          metadataJson: { shiftId: shift.id, expectedRevenue, actualRevenue, difference }
        }
      });
    });

    return { data: { success: true } };
  }

  @Delete("shifts/:id")
  @RequirePermissions("fuel.shifts.manage")
  async deleteShift(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const shift = await this.prisma.fuelShift.findFirst({ where: { tenantId, id } });
    if (!shift) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (shift.status !== "closed") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.fuelSale.updateMany({ where: { tenantId, shiftId: id }, data: { shiftId: null } });
      await tx.fuelShiftNozzleReading.deleteMany({ where: { tenantId, shiftId: id } });
      await tx.fuelShift.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.shift.delete",
          metadataJson: { shiftId: id }
        }
      });
    });

    return { data: { success: true } };
  }

  // --- PRICES ---

  @Get("prices")
  @RequirePermissions("fuel.reports.view")
  async listPrices(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    try {
      const prices = await this.prisma.fuelPrice.findMany({
        where: { tenantId },
        include: { updatedBy: { select: { id: true, fullName: true } } }
      });
      return { data: prices.map((p: { pricePerUnit: Decimal } & Record<string, unknown>) => ({ ...p, pricePerUnit: p.pricePerUnit.toString() })) };
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "P2021") {
        await this.ensureFuelPriceTable();
        return { data: [] };
      }
      throw err;
    }
  }

  @Post("prices")
  @RequirePermissions("fuel.tanks.manage")
  async updatePrice(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpdateFuelPriceDto) {
    const tenantId = req.tenantId;
    let price: { id: string };
    try {
      price = await this.prisma.fuelPrice.upsert({
        where: { tenantId_fuelType: { tenantId, fuelType: body.fuelType } },
        create: {
          tenantId,
          fuelType: body.fuelType,
          pricePerUnit: new Decimal(body.pricePerUnit),
          updatedByUserId: req.user.id
        },
        update: {
          pricePerUnit: new Decimal(body.pricePerUnit),
          updatedByUserId: req.user.id
        }
      });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "P2021") {
        await this.ensureFuelPriceTable();
        price = await this.prisma.fuelPrice.upsert({
          where: { tenantId_fuelType: { tenantId, fuelType: body.fuelType } },
          create: {
            tenantId,
            fuelType: body.fuelType,
            pricePerUnit: new Decimal(body.pricePerUnit),
            updatedByUserId: req.user.id
          },
          update: {
            pricePerUnit: new Decimal(body.pricePerUnit),
            updatedByUserId: req.user.id
          }
        });
      } else {
        throw err;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "fuel.price.update",
        metadataJson: { fuelType: body.fuelType, pricePerUnit: body.pricePerUnit }
      }
    });

    return { data: { id: price.id } };
  }

  // --- REPORTS ---

  @Get("reports")
  @RequirePermissions("fuel.reports.view")
  async reports(
    @Req() req: { tenantId: string },
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string
  ) {
    const tenantId = req.tenantId;

    const fromParam = from?.trim() ? new Date(from) : undefined;
    const toParam = to?.trim() ? new Date(to) : undefined;
    if (fromParam && !Number.isFinite(fromParam.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (toParam && !Number.isFinite(toParam.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    let fromDate: Date;
    let toDate: Date | undefined;
    if (fromParam || toParam) {
      fromDate = fromParam ?? new Date(0);
      toDate = toParam ?? undefined;
    } else {
      const now = new Date();
      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);

      fromDate = startToday;
      const r = (range || "today").trim().toLowerCase();
      if (r === "week") {
        fromDate = new Date(startToday);
        fromDate.setDate(fromDate.getDate() - 6);
      } else if (r === "month") {
        fromDate = new Date(startToday);
        fromDate.setDate(fromDate.getDate() - 29);
      }
    }

    const salesLimitRaw = Number(limit);
    const salesLimit = Number.isFinite(salesLimitRaw) ? Math.min(Math.max(1, Math.floor(salesLimitRaw)), 5000) : 200;

    const createdAt =
      toDate && fromDate ? { gte: fromDate, lte: toDate } : fromDate ? { gte: fromDate } : toDate ? { lte: toDate } : undefined;
    const where: Record<string, unknown> = { tenantId };
    if (createdAt) where.createdAt = createdAt;

    const [count, aggregates, sales] = await Promise.all([
      this.prisma.fuelSale.count({ where }),
      this.prisma.fuelSale.aggregate({ where, _sum: { totalAmount: true, volume: true } }),
      this.prisma.fuelSale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: salesLimit,
        select: {
          id: true,
          createdAt: true,
          volume: true,
          totalAmount: true,
          paymentMethod: true,
          driverName: true,
          licensePlate: true,
          nozzle: { select: { name: true, tank: { select: { fuelType: true } } } },
          customer: { select: { name: true } }
        }
      })
    ]);

    const totalSales = aggregates._sum.totalAmount ?? new Decimal(0);
    const totalVolume = aggregates._sum.volume ?? new Decimal(0);

    return {
      data: {
        totalSales: totalSales.toString(),
        totalVolume: totalVolume.toString(),
        salesCount: count,
        sales: sales.map((s: { volume: Decimal; totalAmount: Decimal } & Record<string, unknown>) => ({
          ...s,
          volume: s.volume.toString(),
          totalAmount: s.totalAmount.toString()
        }))
      }
    };
  }

  @Get("credit/summary")
  @RequirePermissions("fuel.reports.view")
  async creditSummary(@Req() req: { tenantId: string }, @Query("from") from?: string, @Query("to") to?: string) {
    const tenantId = req.tenantId;

    const fromDate = from?.trim() ? new Date(from) : undefined;
    const toDate = to?.trim() ? new Date(to) : undefined;
    const createdAt =
      fromDate && toDate ? { gte: fromDate, lte: toDate } : fromDate ? { gte: fromDate } : toDate ? { lte: toDate } : undefined;

    const where: Record<string, unknown> = { tenantId, paymentMethod: "credit", customerId: { not: null }, status: "posted" };
    if (createdAt) where.createdAt = createdAt;

    const grouped = await this.prisma.fuelSale.groupBy({
      by: ["customerId"],
      where,
      _sum: { totalAmount: true, volume: true },
      _count: { _all: true },
      _max: { createdAt: true }
    });

    const customerIds = grouped
      .map((g: { customerId: string | null }) => g.customerId)
      .filter((v): v is string => typeof v === "string");
    const customers = customerIds.length
      ? await this.prisma.shopCustomer.findMany({
          where: { tenantId, id: { in: customerIds } },
          select: { id: true, name: true, phone: true }
        })
      : [];
    const byId = new Map(customers.map((c: { id: string; name: string; phone: string | null }) => [c.id, c]));

    return {
      data: grouped
        .map(
          (g: {
            customerId: string | null;
            _sum: { totalAmount: Decimal | null; volume: Decimal | null };
            _count: { _all: number };
            _max: { createdAt: Date | null };
          }) => {
          const customerId = g.customerId as string;
          const c = byId.get(customerId);
          return {
            customerId,
            customerName: c?.name ?? customerId,
            customerPhone: c?.phone ?? null,
            salesCount: g._count._all,
            totalVolume: (g._sum.volume ?? new Decimal(0)).toString(),
            totalAmount: (g._sum.totalAmount ?? new Decimal(0)).toString(),
            lastSaleAt: g._max.createdAt
          };
          }
        )
        .sort((a: { lastSaleAt: Date | null }, b: { lastSaleAt: Date | null }) => new Date(b.lastSaleAt ?? 0).getTime() - new Date(a.lastSaleAt ?? 0).getTime())
    };
  }

  @Get("credit/customers/:customerId/statement")
  @RequirePermissions("fuel.reports.view")
  async creditCustomerStatement(
    @Req() req: { tenantId: string },
    @Param("customerId") customerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const tenantId = req.tenantId;

    const customer = await this.prisma.shopCustomer.findFirst({
      where: { tenantId, id: customerId },
      select: { id: true, name: true, phone: true }
    });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const fromDate = from?.trim() ? new Date(from) : undefined;
    const toDate = to?.trim() ? new Date(to) : undefined;
    const createdAt =
      fromDate && toDate ? { gte: fromDate, lte: toDate } : fromDate ? { gte: fromDate } : toDate ? { lte: toDate } : undefined;

    const where: Record<string, unknown> = { tenantId, paymentMethod: "credit", customerId, status: "posted" };
    if (createdAt) where.createdAt = createdAt;

    const [aggregates, sales, byNozzle, byFuelType] = await Promise.all([
      this.prisma.fuelSale.aggregate({ where, _sum: { totalAmount: true, volume: true }, _count: { _all: true } }),
      this.prisma.fuelSale.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 10000,
        select: {
          id: true,
          createdAt: true,
          nozzleId: true,
          invoiceNumber: true,
          volume: true,
          pricePerUnit: true,
          totalAmount: true,
          driverName: true,
          licensePlate: true,
          nozzle: { select: { name: true, tank: { select: { name: true, fuelType: true } } } }
        }
      }),
      this.prisma.fuelSale.groupBy({
        by: ["nozzleId"],
        where,
        _sum: { totalAmount: true, volume: true },
        _count: { _all: true }
      }),
      this.prisma.fuelSale.groupBy({
        by: ["nozzleId"],
        where,
        _sum: { totalAmount: true, volume: true }
      })
    ]);

    const nozzleIds = Array.from(new Set(byNozzle.map((x: { nozzleId: string }) => x.nozzleId)));
    const nozzles = nozzleIds.length
      ? await this.prisma.fuelNozzle.findMany({
          where: { tenantId, id: { in: nozzleIds } },
          select: { id: true, name: true, tank: { select: { name: true, fuelType: true } } }
        })
      : [];
    const nozzleMap = new Map(nozzles.map((n: { id: string; name: string; tank: { name: string; fuelType: string } }) => [n.id, n]));

    return {
      data: {
        customer,
        period: {
          from: fromDate ?? null,
          to: toDate ?? null
        },
        totals: {
          salesCount: aggregates._count._all,
          totalVolume: (aggregates._sum.volume ?? new Decimal(0)).toString(),
          totalAmount: (aggregates._sum.totalAmount ?? new Decimal(0)).toString()
        },
        byNozzle: byNozzle.map((r: { nozzleId: string; _count: { _all: number }; _sum: { totalAmount: Decimal | null; volume: Decimal | null } }) => {
          const ref = nozzleMap.get(r.nozzleId);
          return {
            nozzleId: r.nozzleId,
            nozzleName: ref?.name ?? r.nozzleId,
            tankName: ref?.tank?.name ?? null,
            fuelType: ref?.tank?.fuelType ?? null,
            salesCount: r._count._all,
            totalVolume: (r._sum.volume ?? new Decimal(0)).toString(),
            totalAmount: (r._sum.totalAmount ?? new Decimal(0)).toString()
          };
        }),
        sales: sales.map((s: { volume: Decimal; pricePerUnit: Decimal; totalAmount: Decimal } & Record<string, unknown>) => ({
          ...s,
          volume: s.volume.toString(),
          pricePerUnit: s.pricePerUnit.toString(),
          totalAmount: s.totalAmount.toString()
        }))
      }
    };
  }

  @Get("credit/invoices")
  @RequirePermissions("fuel.reports.view")
  async listCreditInvoices(
    @Req() req: { tenantId: string },
    @Query("month") month?: string,
    @Query("q") q?: string,
    @Query("status") status?: string
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const monthValue = (month ?? "").trim();
    const useMonth = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : null;

    const qValue = (q ?? "").trim();
    const useQ = qValue ? qValue.slice(0, 100) : null;
    const qLike = useQ ? `%${useQ}%` : null;

    const statusValue = (status ?? "").trim();
    const useStatus = statusValue === "issued" || statusValue === "paid" || statusValue === "void" ? statusValue : null;

    const invoices = (await this.prisma.$queryRaw<
      Array<{
        invoiceNumber: string;
        month: string | null;
        periodFrom: Date | null;
        periodTo: Date | null;
        salesCount: number;
        totalVolume: Decimal;
        totalAmount: Decimal;
        status: string;
        createdAt: Date;
        customerId: string;
        customerName: string;
        customerPhone: string | null;
        paidAmount: Decimal | null;
      }>
    >`
      SELECT
        i."invoiceNumber",
        i."month",
        i."periodFrom",
        i."periodTo",
        i."salesCount",
        i."totalVolume",
        i."totalAmount",
        i."status",
        i."createdAt",
        i."customerId",
        c."name" AS "customerName",
        c."phone" AS "customerPhone",
        COALESCE(p."paidAmount", 0) AS "paidAmount"
      FROM "FuelCreditInvoice" i
      LEFT JOIN "ShopCustomer" c ON c."id" = i."customerId" AND c."tenantId" = i."tenantId"
      LEFT JOIN (
        SELECT "tenantId", "invoiceNumber", SUM("amount") AS "paidAmount"
        FROM "FuelCreditInvoicePayment"
        GROUP BY "tenantId", "invoiceNumber"
      ) p ON p."tenantId" = i."tenantId" AND p."invoiceNumber" = i."invoiceNumber"
      WHERE i."tenantId" = ${tenantId}
      AND (${useMonth} IS NULL OR i."month" = ${useMonth})
      AND (${useStatus} IS NULL OR i."status" = ${useStatus})
      AND (
        ${qLike} IS NULL
        OR i."invoiceNumber" ILIKE ${qLike}
        OR c."name" ILIKE ${qLike}
        OR c."phone" ILIKE ${qLike}
      )
      ORDER BY i."createdAt" DESC
      LIMIT 500
    `) as unknown as Array<{
      invoiceNumber: string;
      month: string | null;
      periodFrom: Date | null;
      periodTo: Date | null;
      salesCount: number;
      totalVolume: Decimal;
      totalAmount: Decimal;
      status: string;
      createdAt: Date;
      customerId: string;
      customerName: string;
      customerPhone: string | null;
      paidAmount: Decimal;
    }>;

    return {
      data: invoices.map((i) => {
        const paid = i.paidAmount ?? new Decimal(0);
        const balance = i.totalAmount.sub(paid);
        return {
          invoiceNumber: i.invoiceNumber,
          month: i.month,
          periodFrom: i.periodFrom,
          periodTo: i.periodTo,
          createdAt: i.createdAt,
          status: i.status,
          customer: { id: i.customerId, name: i.customerName, phone: i.customerPhone },
          salesCount: i.salesCount,
          totalVolume: i.totalVolume.toString(),
          totalAmount: i.totalAmount.toString(),
          paidAmount: paid.toString(),
          balance: balance.lessThan(0) ? "0.00" : balance.toString()
        };
      })
    };
  }

  @Get("credit/aging")
  @RequirePermissions("fuel.reports.view")
  async getCreditAging(@Req() req: { tenantId: string }, @Query("asOf") asOf?: string) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const asOfDate = asOf?.trim() ? new Date(asOf) : new Date();
    if (!Number.isFinite(asOfDate.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const rows = (await this.prisma.$queryRaw<
      Array<{
        invoiceNumber: string;
        status: string;
        createdAt: Date;
        periodTo: Date | null;
        customerId: string;
        customerName: string;
        customerPhone: string | null;
        totalAmount: Decimal;
        paidAmount: Decimal;
      }>
    >`
      SELECT
        i."invoiceNumber",
        i."status",
        i."createdAt",
        i."periodTo",
        i."customerId",
        c."name" AS "customerName",
        c."phone" AS "customerPhone",
        i."totalAmount",
        COALESCE(p."paidAmount", 0) AS "paidAmount"
      FROM "FuelCreditInvoice" i
      LEFT JOIN "ShopCustomer" c ON c."id" = i."customerId" AND c."tenantId" = i."tenantId"
      LEFT JOIN (
        SELECT "tenantId", "invoiceNumber", SUM("amount") AS "paidAmount"
        FROM "FuelCreditInvoicePayment"
        GROUP BY "tenantId", "invoiceNumber"
      ) p ON p."tenantId" = i."tenantId" AND p."invoiceNumber" = i."invoiceNumber"
      WHERE i."tenantId" = ${tenantId}
      AND i."status" <> ${"void"}
      ORDER BY i."createdAt" DESC
      LIMIT 2000
    `) as unknown as Array<{
      invoiceNumber: string;
      status: string;
      createdAt: Date;
      periodTo: Date | null;
      customerId: string;
      customerName: string;
      customerPhone: string | null;
      totalAmount: Decimal;
      paidAmount: Decimal;
    }>;

    const byCustomer = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerPhone: string | null;
        invoicesCount: number;
        totalBalance: Decimal;
        bucket0_30: Decimal;
        bucket31_60: Decimal;
        bucket61_90: Decimal;
        bucket90p: Decimal;
      }
    >();

    for (const r of rows) {
      const paid = r.paidAmount ?? new Decimal(0);
      const balance = r.totalAmount.sub(paid);
      if (balance.lessThanOrEqualTo(0)) continue;

      const invoiceDate = r.periodTo ?? r.createdAt;
      const diffMs = asOfDate.getTime() - new Date(invoiceDate).getTime();
      const days = diffMs <= 0 ? 0 : Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const existing =
        byCustomer.get(r.customerId) ??
        ({
          customerId: r.customerId,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          invoicesCount: 0,
          totalBalance: new Decimal(0),
          bucket0_30: new Decimal(0),
          bucket31_60: new Decimal(0),
          bucket61_90: new Decimal(0),
          bucket90p: new Decimal(0)
        } as {
          customerId: string;
          customerName: string;
          customerPhone: string | null;
          invoicesCount: number;
          totalBalance: Decimal;
          bucket0_30: Decimal;
          bucket31_60: Decimal;
          bucket61_90: Decimal;
          bucket90p: Decimal;
        });

      existing.invoicesCount += 1;
      existing.totalBalance = existing.totalBalance.add(balance);

      if (days <= 30) existing.bucket0_30 = existing.bucket0_30.add(balance);
      else if (days <= 60) existing.bucket31_60 = existing.bucket31_60.add(balance);
      else if (days <= 90) existing.bucket61_90 = existing.bucket61_90.add(balance);
      else existing.bucket90p = existing.bucket90p.add(balance);

      byCustomer.set(r.customerId, existing);
    }

    const items = Array.from(byCustomer.values()).sort((a, b) => b.totalBalance.comparedTo(a.totalBalance));
    const totals = items.reduce(
      (acc, x) => {
        acc.customersCount += 1;
        acc.invoicesCount += x.invoicesCount;
        acc.totalBalance = acc.totalBalance.add(x.totalBalance);
        acc.bucket0_30 = acc.bucket0_30.add(x.bucket0_30);
        acc.bucket31_60 = acc.bucket31_60.add(x.bucket31_60);
        acc.bucket61_90 = acc.bucket61_90.add(x.bucket61_90);
        acc.bucket90p = acc.bucket90p.add(x.bucket90p);
        return acc;
      },
      {
        customersCount: 0,
        invoicesCount: 0,
        totalBalance: new Decimal(0),
        bucket0_30: new Decimal(0),
        bucket31_60: new Decimal(0),
        bucket61_90: new Decimal(0),
        bucket90p: new Decimal(0)
      }
    );

    return {
      data: {
        asOf: asOfDate.toISOString(),
        totals: {
          customersCount: totals.customersCount,
          invoicesCount: totals.invoicesCount,
          totalBalance: totals.totalBalance.toString(),
          bucket0_30: totals.bucket0_30.toString(),
          bucket31_60: totals.bucket31_60.toString(),
          bucket61_90: totals.bucket61_90.toString(),
          bucket90p: totals.bucket90p.toString()
        },
        rows: items.map((x) => ({
          customerId: x.customerId,
          customerName: x.customerName,
          customerPhone: x.customerPhone,
          invoicesCount: x.invoicesCount,
          totalBalance: x.totalBalance.toString(),
          bucket0_30: x.bucket0_30.toString(),
          bucket31_60: x.bucket31_60.toString(),
          bucket61_90: x.bucket61_90.toString(),
          bucket90p: x.bucket90p.toString()
        }))
      }
    };
  }

  @Get("credit/customers/:customerId/ledger")
  @RequirePermissions("fuel.reports.view")
  async getCreditCustomerLedger(
    @Req() req: { tenantId: string },
    @Param("customerId") customerId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const customer = await this.prisma.shopCustomer.findFirst({
      where: { tenantId, id: customerId },
      select: { id: true, name: true, phone: true }
    });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const fromDate = from?.trim() ? new Date(from) : undefined;
    const toDate = to?.trim() ? new Date(to) : undefined;
    if (fromDate && !Number.isFinite(fromDate.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (toDate && !Number.isFinite(toDate.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const invoices = (await this.prisma.$queryRaw<
      Array<{
        invoiceNumber: string;
        status: string;
        createdAt: Date;
        month: string | null;
        periodFrom: Date | null;
        periodTo: Date | null;
        totalAmount: Decimal;
        paidAmount: Decimal;
      }>
    >`
      SELECT
        i."invoiceNumber",
        i."status",
        i."createdAt",
        i."month",
        i."periodFrom",
        i."periodTo",
        i."totalAmount",
        COALESCE(p."paidAmount", 0) AS "paidAmount"
      FROM "FuelCreditInvoice" i
      LEFT JOIN (
        SELECT "tenantId", "invoiceNumber", SUM("amount") AS "paidAmount"
        FROM "FuelCreditInvoicePayment"
        GROUP BY "tenantId", "invoiceNumber"
      ) p ON p."tenantId" = i."tenantId" AND p."invoiceNumber" = i."invoiceNumber"
      WHERE i."tenantId" = ${tenantId}
      AND i."customerId" = ${customerId}
      AND (${fromDate ?? null}::timestamp IS NULL OR i."createdAt" >= ${fromDate ?? null})
      AND (${toDate ?? null}::timestamp IS NULL OR i."createdAt" <= ${toDate ?? null})
      ORDER BY i."createdAt" DESC
      LIMIT 2000
    `) as unknown as Array<{
      invoiceNumber: string;
      status: string;
      createdAt: Date;
      month: string | null;
      periodFrom: Date | null;
      periodTo: Date | null;
      totalAmount: Decimal;
      paidAmount: Decimal;
    }>;

    const payments = (await this.prisma.$queryRaw<
      Array<{ id: string; invoiceNumber: string; amount: Decimal; method: string; note: string | null; receivedAt: Date }>
    >`
      SELECT p."id", p."invoiceNumber", p."amount", p."method", p."note", p."receivedAt"
      FROM "FuelCreditInvoicePayment" p
      INNER JOIN "FuelCreditInvoice" i
        ON i."tenantId" = p."tenantId" AND i."invoiceNumber" = p."invoiceNumber"
      WHERE p."tenantId" = ${tenantId}
      AND i."customerId" = ${customerId}
      AND (${fromDate ?? null}::timestamp IS NULL OR p."receivedAt" >= ${fromDate ?? null})
      AND (${toDate ?? null}::timestamp IS NULL OR p."receivedAt" <= ${toDate ?? null})
      ORDER BY p."receivedAt" ASC
      LIMIT 5000
    `) as unknown as Array<{ id: string; invoiceNumber: string; amount: Decimal; method: string; note: string | null; receivedAt: Date }>;

    const totalInvoiced = invoices.reduce((acc, i) => acc.add(i.totalAmount), new Decimal(0));
    const totalPaid = payments.reduce((acc, p) => acc.add(p.amount), new Decimal(0));
    const balance = totalInvoiced.sub(totalPaid);

    const events: Array<
      | { type: "invoice"; at: Date; invoiceNumber: string; amount: Decimal; status: string }
      | { type: "payment"; at: Date; paymentId: string; invoiceNumber: string; amount: Decimal; method: string; note: string | null }
    > = [];
    for (const i of invoices) {
      events.push({ type: "invoice", at: i.createdAt, invoiceNumber: i.invoiceNumber, amount: i.totalAmount, status: i.status });
    }
    for (const p of payments) {
      events.push({
        type: "payment",
        at: p.receivedAt,
        paymentId: p.id,
        invoiceNumber: p.invoiceNumber,
        amount: p.amount,
        method: p.method,
        note: p.note
      });
    }
    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    let running = new Decimal(0);
    const timeline = events.map((e) => {
      if (e.type === "invoice") running = running.add(e.amount);
      else running = running.sub(e.amount);
      return e.type === "invoice"
        ? {
            type: e.type,
            at: e.at,
            invoiceNumber: e.invoiceNumber,
            debit: e.amount.toString(),
            credit: "0.00",
            status: e.status,
            runningBalance: running.toString()
          }
        : {
            type: e.type,
            at: e.at,
            invoiceNumber: e.invoiceNumber,
            paymentId: e.paymentId,
            debit: "0.00",
            credit: e.amount.toString(),
            method: e.method,
            note: e.note,
            runningBalance: running.toString()
          };
    });

    return {
      data: {
        customer,
        period: { from: fromDate?.toISOString() ?? null, to: toDate?.toISOString() ?? null },
        totals: {
          invoicesCount: invoices.length,
          paymentsCount: payments.length,
          totalInvoiced: totalInvoiced.toString(),
          totalPaid: totalPaid.toString(),
          balance: balance.lessThan(0) ? "0.00" : balance.toString()
        },
        invoices: invoices.map((i) => {
        const paid = i.paidAmount ?? new Decimal(0);
          const invBal = i.totalAmount.sub(paid);
          return {
            invoiceNumber: i.invoiceNumber,
            status: i.status,
            createdAt: i.createdAt,
            month: i.month,
            periodFrom: i.periodFrom,
            periodTo: i.periodTo,
            totalAmount: i.totalAmount.toString(),
            paidAmount: paid.toString(),
            balance: invBal.lessThan(0) ? "0.00" : invBal.toString()
          };
        }),
        payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })),
        timeline
      }
    };
  }

  @Get("credit/invoices/:invoiceNumber")
  @RequirePermissions("fuel.reports.view")
  async getCreditInvoice(@Req() req: { tenantId: string }, @Param("invoiceNumber") invoiceNumber: string) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const inv = (await this.prisma.$queryRaw<
      Array<{
        invoiceNumber: string;
        month: string | null;
        periodFrom: Date | null;
        periodTo: Date | null;
        salesCount: number;
        totalVolume: Decimal;
        totalAmount: Decimal;
        status: string;
        createdAt: Date;
        customerId: string;
        customerName: string;
        customerPhone: string | null;
      }>
    >`
      SELECT
        i."invoiceNumber",
        i."month",
        i."periodFrom",
        i."periodTo",
        i."salesCount",
        i."totalVolume",
        i."totalAmount",
        i."status",
        i."createdAt",
        i."customerId",
        c."name" AS "customerName",
        c."phone" AS "customerPhone"
      FROM "FuelCreditInvoice" i
      LEFT JOIN "ShopCustomer" c ON c."id" = i."customerId" AND c."tenantId" = i."tenantId"
      WHERE i."tenantId" = ${tenantId} AND i."invoiceNumber" = ${invoiceNumber}
      LIMIT 1
    `) as unknown as Array<{
      invoiceNumber: string;
      month: string | null;
      periodFrom: Date | null;
      periodTo: Date | null;
      salesCount: number;
      totalVolume: Decimal;
      totalAmount: Decimal;
      status: string;
      createdAt: Date;
      customerId: string;
      customerName: string;
      customerPhone: string | null;
    }>;
    if (!inv[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const payments = (await this.prisma.$queryRaw<
      Array<{ id: string; amount: Decimal; method: string; note: string | null; receivedAt: Date; createdAt: Date }>
    >`
      SELECT "id", "amount", "method", "note", "receivedAt", "createdAt"
      FROM "FuelCreditInvoicePayment"
      WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      ORDER BY "receivedAt" ASC
      LIMIT 500
    `) as unknown as Array<{ id: string; amount: Decimal; method: string; note: string | null; receivedAt: Date; createdAt: Date }>;

    const sales = await this.prisma.fuelSale.findMany({
      where: { tenantId, invoiceNumber, paymentMethod: "credit", status: "posted" },
      orderBy: { createdAt: "asc" },
      take: 10000,
      select: {
        id: true,
        createdAt: true,
        nozzleId: true,
        volume: true,
        pricePerUnit: true,
        totalAmount: true,
        driverName: true,
        licensePlate: true,
        nozzle: { select: { name: true, tank: { select: { name: true, fuelType: true } } } }
      }
    });

    const paidAmount = payments.reduce((acc, p) => acc.add(p.amount), new Decimal(0));
    const balance = inv[0].totalAmount.sub(paidAmount);

    return {
      data: {
        invoice: {
          invoiceNumber: inv[0].invoiceNumber,
          month: inv[0].month,
          periodFrom: inv[0].periodFrom,
          periodTo: inv[0].periodTo,
          createdAt: inv[0].createdAt,
          status: inv[0].status,
          customer: { id: inv[0].customerId, name: inv[0].customerName, phone: inv[0].customerPhone },
          salesCount: inv[0].salesCount,
          totalVolume: inv[0].totalVolume.toString(),
          totalAmount: inv[0].totalAmount.toString(),
          paidAmount: paidAmount.toString(),
          balance: balance.lessThan(0) ? "0.00" : balance.toString()
        },
        payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })),
        sales: sales.map((s) => ({
          ...s,
          volume: s.volume.toString(),
          pricePerUnit: s.pricePerUnit.toString(),
          totalAmount: s.totalAmount.toString()
        }))
      }
    };
  }

  @Patch("credit/invoices/:invoiceNumber/void")
  @RequirePermissions("fuel.sales.create")
  async voidCreditInvoice(@Req() req: { tenantId: string; user: { id: string } }, @Param("invoiceNumber") invoiceNumber: string) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invRows = (await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1
      `) as unknown as Array<{ status: string }>;
      if (!invRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invRows[0].status === "void") return;

      const paidRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paid = paidRows[0]?.paid ?? new Decimal(0);
      if (paid.greaterThan(0)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceHasPayments" } }, 400);
      }

      await tx.$executeRaw`
        UPDATE "FuelCreditInvoice"
        SET "status" = ${"void"}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.void",
          metadataJson: { invoiceNumber }
        }
      });
    });

    return { data: { success: true } };
  }

  @Patch("credit/invoices/:invoiceNumber/reopen")
  @RequirePermissions("fuel.sales.create")
  async reopenCreditInvoice(@Req() req: { tenantId: string; user: { id: string } }, @Param("invoiceNumber") invoiceNumber: string) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invRows = (await tx.$queryRaw<Array<{ status: string; totalAmount: Decimal }>>`
        SELECT "status","totalAmount" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1
      `) as unknown as Array<{ status: string; totalAmount: Decimal }>;
      if (!invRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invRows[0].status !== "void") return;

      const paidRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paid = paidRows[0]?.paid ?? new Decimal(0);
      const statusValue = paid.greaterThanOrEqualTo(invRows[0].totalAmount) ? "paid" : "issued";

      await tx.$executeRaw`
        UPDATE "FuelCreditInvoice"
        SET "status" = ${statusValue}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.reopen",
          metadataJson: { invoiceNumber }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("credit/invoices/:invoiceNumber/payments")
  @RequirePermissions("fuel.sales.create")
  async addCreditInvoicePayment(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("invoiceNumber") invoiceNumber: string,
    @Body() body: { amount: number; method: string; note?: string; receivedAt?: string }
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const amount = new Decimal(body.amount);
    if (amount.lessThanOrEqualTo(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const method = (body.method ?? "").trim();
    if (!method) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const receivedAt = body.receivedAt?.trim() ? new Date(body.receivedAt) : new Date();
    const note = body.note?.trim() ? body.note.trim() : null;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoiceRows = (await tx.$queryRaw<
        Array<{ totalAmount: Decimal; status: string }>
      >`SELECT "totalAmount","status" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1`) as unknown as Array<{
        totalAmount: Decimal;
        status: string;
      }>;
      if (!invoiceRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoiceRows[0].status === "void") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceVoided" } }, 400);
      }

      const paidBeforeRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paidBefore = paidBeforeRows[0]?.paid ?? new Decimal(0);
      const remaining = invoiceRows[0].totalAmount.sub(paidBefore);
      if (amount.greaterThan(remaining)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.paymentExceedsBalance" } }, 400);
      }

      await tx.$executeRaw`
        INSERT INTO "FuelCreditInvoicePayment" ("tenantId","invoiceNumber","amount","method","note","receivedAt","createdByUserId")
        VALUES (${tenantId}, ${invoiceNumber}, ${amount}, ${method}, ${note}, ${receivedAt}, ${req.user.id})
      `;

      const paidRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paid = paidRows[0]?.paid ?? new Decimal(0);
      const status = paid.greaterThanOrEqualTo(invoiceRows[0].totalAmount) ? "paid" : "issued";
      await tx.$executeRaw`
        UPDATE "FuelCreditInvoice"
        SET "status" = ${status}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.payment.create",
          metadataJson: { invoiceNumber, amount: body.amount, method }
        }
      });
    });

    return { data: { success: true } };
  }

  @Patch("credit/invoices/:invoiceNumber/payments/:paymentId")
  @RequirePermissions("fuel.sales.create")
  async updateCreditInvoicePayment(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("invoiceNumber") invoiceNumber: string,
    @Param("paymentId") paymentId: string,
    @Body() body: { amount?: number; method?: string; note?: string; receivedAt?: string }
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const methodInput = body.method === undefined ? undefined : (body.method ?? "").trim();
    if (methodInput !== undefined && !methodInput) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const noteInput = body.note === undefined ? undefined : body.note?.trim() ? body.note.trim() : null;
    const receivedAtInput =
      body.receivedAt === undefined ? undefined : body.receivedAt?.trim() ? new Date(body.receivedAt) : undefined;

    const amountInput = body.amount === undefined ? undefined : new Decimal(body.amount);
    if (amountInput !== undefined && amountInput.lessThanOrEqualTo(0)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoiceRows = (await tx.$queryRaw<Array<{ totalAmount: Decimal; status: string }>>`
        SELECT "totalAmount","status" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1
      `) as unknown as Array<{ totalAmount: Decimal; status: string }>;
      if (!invoiceRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoiceRows[0].status === "void") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceVoided" } }, 400);
      }

      const paymentRows = (await tx.$queryRaw<Array<{ amount: Decimal; method: string; note: string | null; receivedAt: Date }>>`
        SELECT "amount","method","note","receivedAt"
        FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} AND "id" = ${paymentId}
        LIMIT 1
      `) as unknown as Array<{ amount: Decimal; method: string; note: string | null; receivedAt: Date }>;
      if (!paymentRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      const newAmount = amountInput ?? paymentRows[0].amount;
      const newMethod = methodInput ?? paymentRows[0].method;
      const newNote = noteInput ?? paymentRows[0].note;
      const newReceivedAt = receivedAtInput ?? paymentRows[0].receivedAt;

      const paidBeforeRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} AND "id" <> ${paymentId}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paidBefore = paidBeforeRows[0]?.paid ?? new Decimal(0);
      const remaining = invoiceRows[0].totalAmount.sub(paidBefore);
      if (newAmount.greaterThan(remaining)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.paymentExceedsBalance" } }, 400);
      }

      await tx.$executeRaw`
        UPDATE "FuelCreditInvoicePayment"
        SET "amount" = ${newAmount}, "method" = ${newMethod}, "note" = ${newNote}, "receivedAt" = ${newReceivedAt}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} AND "id" = ${paymentId}
      `;

      const paid = paidBefore.add(newAmount);
      const invoiceStatus = paid.greaterThanOrEqualTo(invoiceRows[0].totalAmount) ? "paid" : "issued";
      await tx.$executeRaw`
        UPDATE "FuelCreditInvoice"
        SET "status" = ${invoiceStatus}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.payment.update",
          metadataJson: { invoiceNumber, paymentId, amount: newAmount.toString(), method: newMethod }
        }
      });
    });

    return { data: { success: true } };
  }

  @Delete("credit/invoices/:invoiceNumber/payments/:paymentId")
  @RequirePermissions("fuel.sales.create")
  async deleteCreditInvoicePayment(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("invoiceNumber") invoiceNumber: string,
    @Param("paymentId") paymentId: string
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invRows = (await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1
      `) as unknown as Array<{ status: string }>;
      if (!invRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invRows[0].status === "void") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceVoided" } }, 400);
      }

      const deletedRows = await tx.$queryRaw<Array<{ amount: Decimal; method: string }>>`
        DELETE FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} AND "id" = ${paymentId}
        RETURNING "amount", "method"
      `;
      const deleted = (deletedRows as unknown as Array<{ amount: Decimal; method: string }>)[0];
      if (!deleted) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      const invoiceRows = (await tx.$queryRaw<Array<{ totalAmount: Decimal }>>`
        SELECT "totalAmount" FROM "FuelCreditInvoice" WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber} LIMIT 1
      `) as unknown as Array<{ totalAmount: Decimal }>;
      if (!invoiceRows[0]) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      const paidRows = (await tx.$queryRaw<Array<{ paid: Decimal | null }>>`
        SELECT SUM("amount") AS "paid" FROM "FuelCreditInvoicePayment"
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `) as unknown as Array<{ paid: Decimal | null }>;
      const paid = paidRows[0]?.paid ?? new Decimal(0);
      const status = paid.greaterThanOrEqualTo(invoiceRows[0].totalAmount) ? "paid" : "issued";
      await tx.$executeRaw`
        UPDATE "FuelCreditInvoice"
        SET "status" = ${status}
        WHERE "tenantId" = ${tenantId} AND "invoiceNumber" = ${invoiceNumber}
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.payment.delete",
          metadataJson: { invoiceNumber, paymentId, amount: deleted.amount.toString(), method: deleted.method }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("credit/customers/:customerId/invoices/generate")
  @RequirePermissions("fuel.sales.create")
  async generateCreditInvoice(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("customerId") customerId: string,
    @Body() body: { from?: string; to?: string; month?: string }
  ) {
    const tenantId = req.tenantId;
    await this.ensureFuelCreditInvoiceTables();

    const customer = await this.prisma.shopCustomer.findFirst({
      where: { tenantId, id: customerId },
      select: { id: true, name: true }
    });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const month = (body.month ?? "").trim();
    const monthMatch = /^\d{4}-\d{2}$/.test(month) ? month : null;
    const fromDate = monthMatch ? new Date(`${monthMatch}-01T00:00:00.000Z`) : body.from?.trim() ? new Date(body.from) : undefined;
    const toDate = monthMatch
      ? new Date(new Date(`${monthMatch}-01T00:00:00.000Z`).getUTCFullYear(), new Date(`${monthMatch}-01T00:00:00.000Z`).getUTCMonth() + 1, 0, 23, 59, 59, 999)
      : body.to?.trim()
        ? new Date(body.to)
        : undefined;
    const createdAt =
      fromDate && toDate ? { gte: fromDate, lte: toDate } : fromDate ? { gte: fromDate } : toDate ? { lte: toDate } : undefined;

    const where: Record<string, unknown> = {
      tenantId,
      paymentMethod: "credit",
      customerId,
      status: "posted",
      invoiceNumber: null
    };
    if (createdAt) where.createdAt = createdAt;

    const rangeKey = monthMatch ? monthMatch.replace("-", "") : "custom";
    const prefix = `FUEL-CR-${rangeKey}-`;

    const last = await this.prisma.fuelSale.findFirst({
      where: { tenantId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true }
    });
    const lastSeq = last?.invoiceNumber ? Number(last.invoiceNumber.slice(prefix.length)) : 0;
    const nextSeq = Number.isFinite(lastSeq) && lastSeq > 0 ? lastSeq + 1 : 1;
    const invoiceNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updates = await tx.fuelSale.updateMany({
        where,
        data: { invoiceNumber }
      });

      const aggregates = await tx.fuelSale.aggregate({
        where: { tenantId, customerId, paymentMethod: "credit", status: "posted", invoiceNumber },
        _sum: { totalAmount: true, volume: true },
        _count: { _all: true }
      });

      await tx.$executeRaw`
        INSERT INTO "FuelCreditInvoice" ("tenantId","customerId","invoiceNumber","month","periodFrom","periodTo","salesCount","totalVolume","totalAmount","status","createdByUserId")
        VALUES (
          ${tenantId},
          ${customerId},
          ${invoiceNumber},
          ${monthMatch},
          ${fromDate ?? null},
          ${toDate ?? null},
          ${aggregates._count._all},
          ${aggregates._sum.volume ?? new Decimal(0)},
          ${aggregates._sum.totalAmount ?? new Decimal(0)},
          ${"issued"},
          ${req.user.id}
        )
        ON CONFLICT ("tenantId","invoiceNumber") DO NOTHING
      `;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.credit.invoice.generate",
          metadataJson: { customerId, invoiceNumber, from: fromDate ?? null, to: toDate ?? null, salesCount: updates.count }
        }
      });

      return {
        invoiceNumber,
        assignedSalesCount: updates.count,
        totals: {
          salesCount: aggregates._count._all,
          totalVolume: (aggregates._sum.volume ?? new Decimal(0)).toString(),
          totalAmount: (aggregates._sum.totalAmount ?? new Decimal(0)).toString()
        }
      };
    });

    if (result.assignedSalesCount === 0) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.notFound" } }, 400);
    }

    return { data: { customerId: customer.id, customerName: customer.name, ...result } };
  }

  // --- SALES ---

  @Get("sales")
  @RequirePermissions("fuel.sales.view")
  async listSales(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const sales = await this.prisma.fuelSale.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        nozzle: { select: { id: true, name: true, tank: { select: { id: true, name: true, fuelType: true } } } },
        shift: { select: { id: true, status: true, openedAt: true, closedAt: true } },
        customer: { select: { id: true, name: true } }
      },
      take: 100
    });

    return {
      data: sales.map((s) => ({
        ...s,
        volume: s.volume.toString(),
        pricePerUnit: s.pricePerUnit.toString(),
        totalAmount: s.totalAmount.toString()
      }))
    };
  }

  @Post("sales")
  @RequirePermissions("fuel.sales.create")
  async createSale(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateFuelSaleDto) {
    const tenantId = req.tenantId;
    const nozzle = await this.prisma.fuelNozzle.findFirst({ where: { tenantId, id: body.nozzleId }, select: { id: true, tankId: true } });
    if (!nozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.customerId) {
      const customer = await this.prisma.shopCustomer.findFirst({ where: { tenantId, id: body.customerId } });
      if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const volume = new Decimal(body.volume);
    const pricePerUnit = new Decimal(body.pricePerUnit);
    const totalAmount = volume.mul(pricePerUnit);

    const sale = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let shiftId: string | null = body.shiftId ?? null;
      if (shiftId) {
        const shift = await tx.fuelShift.findFirst({ where: { tenantId, id: shiftId }, select: { status: true } });
        if (!shift || shift.status !== "open") {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
      } else {
        const reading = await tx.fuelShiftNozzleReading.findFirst({
          where: { tenantId, nozzleId: body.nozzleId, shift: { status: "open" } },
          select: { shiftId: true }
        });
        shiftId = reading?.shiftId ?? null;
      }

      const created = await tx.fuelSale.create({
        data: {
          tenantId,
          shiftId,
          nozzleId: body.nozzleId,
          customerId: body.customerId || null,
          driverName: body.driverName || null,
          licensePlate: body.licensePlate || null,
          volume,
          pricePerUnit,
          totalAmount,
          paymentMethod: body.paymentMethod.trim(),
          status: "posted"
        }
      });

      const tankUpdate = await tx.fuelTank.updateMany({
        where: { tenantId, id: nozzle.tankId, currentVolume: { gte: volume } },
        data: { currentVolume: { decrement: volume } }
      });
      if (tankUpdate.count === 0) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.stockInsufficient" } }, 400);
      }

      await tx.fuelNozzle.update({
        where: { id: nozzle.id },
        data: { currentTotalizerReading: { increment: volume } }
      });

      if (shiftId) {
        await tx.fuelShiftNozzleReading.updateMany({
          where: { tenantId, shiftId, nozzleId: nozzle.id },
          data: { totalVolume: { increment: volume }, totalAmount: { increment: totalAmount } }
        });
        await tx.fuelShift.update({
          where: { id: shiftId },
          data: { expectedRevenue: { increment: totalAmount } }
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.sale.create",
          metadataJson: { saleId: created.id, nozzleId: body.nozzleId, shiftId, totalAmount }
        }
      });

      return created;
    });

    return { data: { id: sale.id } };
  }

  @Patch("sales/:id")
  @RequirePermissions("fuel.sales.create")
  async updateSale(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") id: string,
    @Body() body: UpdateFuelSaleDto
  ) {
    const tenantId = req.tenantId;
    const sale = await this.prisma.fuelSale.findFirst({
      where: { tenantId, id },
      include: { nozzle: true }
    });
    if (!sale) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const nextNozzleId = body.nozzleId ?? sale.nozzleId;
    const nextNozzle = await this.prisma.fuelNozzle.findFirst({
      where: { tenantId, id: nextNozzleId },
      include: { tank: true }
    });
    if (!nextNozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.shiftId) {
      const shift = await this.prisma.fuelShift.findFirst({ where: { tenantId, id: body.shiftId, status: "open" } });
      if (!shift) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const nextVolume = new Decimal(body.volume ?? sale.volume);
    const nextPrice = new Decimal(body.pricePerUnit ?? sale.pricePerUnit);
    const nextTotal = nextVolume.mul(nextPrice);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const nextShiftId = body.shiftId ?? sale.shiftId;
      if (nextShiftId) {
        const shift = await tx.fuelShift.findFirst({ where: { tenantId, id: nextShiftId }, select: { status: true } });
        if (!shift || shift.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      const oldTankId = sale.nozzle.tankId;
      const oldVolume = sale.volume;
      const newTankId = nextNozzle.tankId;

      await tx.fuelTank.update({
        where: { id: oldTankId },
        data: { currentVolume: { increment: oldVolume } }
      });
      const tankUpdate = await tx.fuelTank.updateMany({
        where: { tenantId, id: newTankId, currentVolume: { gte: nextVolume } },
        data: { currentVolume: { decrement: nextVolume } }
      });
      if (tankUpdate.count === 0) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.stockInsufficient" } }, 400);
      }

      if (sale.nozzleId === nextNozzleId) {
        const current = await tx.fuelNozzle.findFirst({
          where: { tenantId, id: sale.nozzleId },
          select: { currentTotalizerReading: true }
        });
        if (!current) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
        const nextTotalizer = current.currentTotalizerReading.sub(oldVolume).add(nextVolume);
        await tx.fuelNozzle.update({
          where: { id: sale.nozzleId },
          data: { currentTotalizerReading: nextTotalizer.lessThan(0) ? new Decimal(0) : nextTotalizer }
        });
      } else {
        const [oldNozzle, newNozzle] = await Promise.all([
          tx.fuelNozzle.findFirst({ where: { tenantId, id: sale.nozzleId }, select: { currentTotalizerReading: true } }),
          tx.fuelNozzle.findFirst({ where: { tenantId, id: nextNozzleId }, select: { currentTotalizerReading: true } })
        ]);
        if (!oldNozzle || !newNozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
        const oldNext = oldNozzle.currentTotalizerReading.sub(oldVolume);
        await tx.fuelNozzle.update({
          where: { id: sale.nozzleId },
          data: { currentTotalizerReading: oldNext.lessThan(0) ? new Decimal(0) : oldNext }
        });
        await tx.fuelNozzle.update({
          where: { id: nextNozzleId },
          data: { currentTotalizerReading: newNozzle.currentTotalizerReading.add(nextVolume) }
        });
      }

      await tx.fuelSale.update({
        where: { id: sale.id },
        data: {
          nozzleId: nextNozzleId,
          shiftId: nextShiftId,
          customerId: body.customerId !== undefined ? body.customerId || null : sale.customerId,
          driverName: body.driverName !== undefined ? body.driverName || null : sale.driverName,
          licensePlate: body.licensePlate !== undefined ? body.licensePlate || null : sale.licensePlate,
          volume: nextVolume,
          pricePerUnit: nextPrice,
          totalAmount: nextTotal,
          paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod.trim() : sale.paymentMethod
        }
      });

      if (sale.shiftId && nextShiftId && sale.shiftId === nextShiftId && sale.nozzleId === nextNozzleId) {
        const deltaVolume = nextVolume.sub(sale.volume);
        const deltaTotal = nextTotal.sub(sale.totalAmount);
        await tx.fuelShiftNozzleReading.updateMany({
          where: { tenantId, shiftId: nextShiftId, nozzleId: nextNozzleId },
          data: { totalVolume: { increment: deltaVolume }, totalAmount: { increment: deltaTotal } }
        });
        await tx.fuelShift.update({ where: { id: nextShiftId }, data: { expectedRevenue: { increment: deltaTotal } } });
      } else {
        if (sale.shiftId) {
          const shift = await tx.fuelShift.findFirst({ where: { tenantId, id: sale.shiftId }, select: { status: true } });
          if (!shift || shift.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          await tx.fuelShiftNozzleReading.updateMany({
            where: { tenantId, shiftId: sale.shiftId, nozzleId: sale.nozzleId },
            data: { totalVolume: { decrement: sale.volume }, totalAmount: { decrement: sale.totalAmount } }
          });
          await tx.fuelShift.update({ where: { id: sale.shiftId }, data: { expectedRevenue: { decrement: sale.totalAmount } } });
        }
        if (nextShiftId) {
          await tx.fuelShiftNozzleReading.updateMany({
            where: { tenantId, shiftId: nextShiftId, nozzleId: nextNozzleId },
            data: { totalVolume: { increment: nextVolume }, totalAmount: { increment: nextTotal } }
          });
          await tx.fuelShift.update({ where: { id: nextShiftId }, data: { expectedRevenue: { increment: nextTotal } } });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.sale.update",
          metadataJson: { saleId: sale.id, oldNozzleId: sale.nozzleId, newNozzleId: nextNozzleId, nextTotal }
        }
      });
    });

    return { data: { success: true } };
  }

  @Delete("sales/:id")
  @RequirePermissions("fuel.sales.create")
  async deleteSale(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const sale = await this.prisma.fuelSale.findFirst({
      where: { tenantId, id },
      include: { nozzle: true }
    });
    if (!sale) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (sale.shiftId) {
        const shift = await tx.fuelShift.findFirst({ where: { tenantId, id: sale.shiftId }, select: { status: true } });
        if (!shift || shift.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      await tx.fuelTank.update({
        where: { id: sale.nozzle.tankId },
        data: { currentVolume: { increment: sale.volume } }
      });
      const nozzle = await tx.fuelNozzle.findFirst({ where: { tenantId, id: sale.nozzleId }, select: { currentTotalizerReading: true } });
      if (nozzle) {
        const nextTotalizer = nozzle.currentTotalizerReading.sub(sale.volume);
        await tx.fuelNozzle.update({
          where: { id: sale.nozzleId },
          data: { currentTotalizerReading: nextTotalizer.lessThan(0) ? new Decimal(0) : nextTotalizer }
        });
      }
      if (sale.shiftId) {
        await tx.fuelShiftNozzleReading.updateMany({
          where: { tenantId, shiftId: sale.shiftId, nozzleId: sale.nozzleId },
          data: { totalVolume: { decrement: sale.volume }, totalAmount: { decrement: sale.totalAmount } }
        });
        await tx.fuelShift.update({ where: { id: sale.shiftId }, data: { expectedRevenue: { decrement: sale.totalAmount } } });
      }
      await tx.fuelSale.delete({ where: { id: sale.id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.sale.delete",
          metadataJson: { saleId: sale.id, tankId: sale.nozzle.tankId, volume: sale.volume }
        }
      });
    });

    return { data: { success: true } };
  }
}
