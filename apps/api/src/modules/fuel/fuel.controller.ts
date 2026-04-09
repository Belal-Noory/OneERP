import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { MembershipModuleGuard } from "../../shared/membership-module.guard";
import { CreateFuelReceivingDto, CreateNozzleDto, CreatePumpDto, CreateTankDipDto, CreateTankDto, UpdateNozzleDto, UpdatePumpDto, UpdateTankDto } from "./dto/fuel.dto";

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
}
