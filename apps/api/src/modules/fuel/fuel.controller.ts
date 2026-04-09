import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Prisma } from "@prisma/client";
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
  UpdateNozzleDto,
  UpdatePumpDto,
  UpdateTankDto
} from "./dto/fuel.dto";

@Controller("api/fuel")
@UseGuards(AuthGuard("jwt"), TenantGuard, ModuleEnabledGuard("fuel"), MembershipModuleGuard("fuel"), PermissionsGuard)
export class FuelController {
  constructor(private readonly prisma: PrismaService) {}

  // --- TANKS ---

  @Get("tanks")
  @RequirePermissions("fuel.tanks.view")
  async listTanks(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const tanks = await this.prisma.fuelTank.findMany({
      where: { tenantId },
      orderBy: { name: "asc" }
    });
    return { data: tanks.map((t) => ({ ...t, capacity: t.capacity.toString(), currentVolume: t.currentVolume.toString() })) };
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
        receivings: tank.receivings.map((r) => ({
          ...r,
          volumeReceived: r.volumeReceived.toString(),
          pricePerUnit: r.pricePerUnit.toString(),
          totalCost: r.totalCost.toString()
        })),
        dips: tank.dips.map((d) => ({
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
        capacity: new Prisma.Decimal(body.capacity),
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
        capacity: body.capacity !== undefined ? new Prisma.Decimal(body.capacity) : undefined,
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

    const totalCost = new Prisma.Decimal(body.volumeReceived).mul(new Prisma.Decimal(body.pricePerUnit));

    await this.prisma.$transaction(async (tx) => {
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

    const measured = new Prisma.Decimal(body.measuredVolume);
    const diff = measured.sub(tank.currentVolume);

    await this.prisma.$transaction(async (tx) => {
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
      data: pumps.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        nozzles: p.nozzles.map((n) => ({
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
        currentTotalizerReading: new Prisma.Decimal(body.currentTotalizerReading ?? 0),
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
        currentTotalizerReading: body.currentTotalizerReading !== undefined ? new Prisma.Decimal(body.currentTotalizerReading) : undefined,
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
            nozzle: { select: { id: true, name: true, tank: { select: { id: true, name: true, fuelType: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      take: 50
    });

    return {
      data: shifts.map((s) => ({
        ...s,
        expectedRevenue: s.expectedRevenue.toString(),
        actualRevenue: s.actualRevenue.toString(),
        difference: s.difference.toString(),
        readings: s.readings.map((r) => ({
          ...r,
          openingReading: r.openingReading.toString(),
          closingReading: r.closingReading?.toString() ?? null,
          totalVolume: r.totalVolume.toString(),
          pricePerUnit: r.pricePerUnit.toString(),
          totalAmount: r.totalAmount.toString()
        }))
      }))
    };
  }

  @Post("shifts/open")
  @RequirePermissions("fuel.shifts.manage")
  async openShift(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: OpenFuelShiftDto) {
    const tenantId = req.tenantId;
    const uniqueNozzleIds = Array.from(new Set((body.nozzles ?? []).map((n) => n.nozzleId)));
    if (uniqueNozzleIds.length === 0) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invalidInput" } }, 400);
    }

    const nozzles = await this.prisma.fuelNozzle.findMany({
      where: { tenantId, id: { in: uniqueNozzleIds }, status: "active" }
    });
    if (nozzles.length !== uniqueNozzleIds.length) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invalidInput" } }, 400);
    }

    const openShiftCount = await this.prisma.fuelShift.count({ where: { tenantId, status: "open" } });
    if (openShiftCount > 0) {
      throw new HttpException({ error: { code: "ALREADY_EXISTS", message_key: "errors.alreadyExists" } }, 400);
    }

    const nozzlesMap = new Map(nozzles.map((n) => [n.id, n]));
    const byNozzle = new Map(body.nozzles.map((n) => [n.nozzleId, n]));

    const shift = await this.prisma.$transaction(async (tx) => {
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
            pricePerUnit: new Prisma.Decimal(nozzleInput.pricePerUnit)
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
    if (shift.status !== "open") throw new HttpException({ error: { code: "BAD_REQUEST", message_key: "errors.badRequest" } }, 400);

    const closingByNozzle = new Map((body.nozzles ?? []).map((n) => [n.nozzleId, n]));
    if (!shift.readings.every((r) => closingByNozzle.has(r.nozzleId))) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invalidInput" } }, 400);
    }

    let expectedRevenue = new Prisma.Decimal(0);

    await this.prisma.$transaction(async (tx) => {
      for (const reading of shift.readings) {
        const close = closingByNozzle.get(reading.nozzleId)!;
        const closingReading = new Prisma.Decimal(close.closingReading);
        if (closingReading.lessThan(reading.openingReading)) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invalidInput" } }, 400);
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

      const actualRevenue = new Prisma.Decimal(body.actualRevenue);
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
    const nozzle = await this.prisma.fuelNozzle.findFirst({
      where: { tenantId, id: body.nozzleId },
      include: { tank: true }
    });
    if (!nozzle) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    if (body.shiftId) {
      const shift = await this.prisma.fuelShift.findFirst({ where: { tenantId, id: body.shiftId } });
      if (!shift || shift.status !== "open") throw new HttpException({ error: { code: "BAD_REQUEST", message_key: "errors.badRequest" } }, 400);
    }

    if (body.customerId) {
      const customer = await this.prisma.shopCustomer.findFirst({ where: { tenantId, id: body.customerId } });
      if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const volume = new Prisma.Decimal(body.volume);
    if (nozzle.tank.currentVolume.lessThan(volume)) {
      throw new HttpException({ error: { code: "BAD_REQUEST", message_key: "errors.badRequest" } }, 400);
    }
    const pricePerUnit = new Prisma.Decimal(body.pricePerUnit);
    const totalAmount = volume.mul(pricePerUnit);

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fuelSale.create({
        data: {
          tenantId,
          shiftId: body.shiftId || null,
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

      await tx.fuelTank.update({
        where: { id: nozzle.tankId },
        data: { currentVolume: { decrement: volume } }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "fuel.sale.create",
          metadataJson: { saleId: created.id, nozzleId: body.nozzleId, shiftId: body.shiftId || null, totalAmount }
        }
      });

      return created;
    });

    return { data: { id: sale.id } };
  }
}
