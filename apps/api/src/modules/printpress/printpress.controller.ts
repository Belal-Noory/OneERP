import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { promises as fs } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { PrismaService } from "../../prisma/prisma.service";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { TenantGuard } from "../../shared/tenant.guard";
import {
  CreatePrintPressJobDto,
  CreatePrintPressInvoiceDto,
  CreatePrintPressInvoicePaymentDto,
  CreatePrintPressQuotationDto,
  ListPrintPressCustomersQueryDto,
  ListPrintPressExpensesQueryDto,
  ListPrintPressInvoicesQueryDto,
  ListPrintPressIncomeQueryDto,
  ListPrintPressJobsQueryDto,
  ListPrintPressQuotationsQueryDto,
  UpdatePrintPressInvoicePaymentDto,
  UpdatePrintPressSettingsDto,
  UpdatePrintPressJobDto,
  UpdatePrintPressInvoiceDto,
  UpdatePrintPressQuotationDto,
  UpsertPrintPressInvoiceLineDto,
  UpsertPrintPressQuotationLineDto,
  UpsertPrintPressCustomerDto,
  UpsertPrintPressExpenseDto,
  UpsertPrintPressRecurringExpenseDto,
  UpsertPrintPressSupplierDto,
  UpsertPrintPressIncomeDto
} from "./dto/printpress.dto";

@Controller("printpress")
export class PrintPressController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("dashboard/summary")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.dashboard.view")
  async dashboardSummary(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [todayIncomeAgg, todayExpensesAgg, monthRevenueAgg, monthExpensesAgg, monthTaxAgg, pendingJobs, completedJobs, urgentOrders, pendingPayments] =
      await Promise.all([
        this.prisma.printPressIncome.aggregate({ where: { tenantId, moduleId: "printpress", incomeDate: { gte: startOfDay, lt: endOfDay } }, _sum: { amount: true } }),
        this.prisma.printPressExpense.aggregate({ where: { tenantId, moduleId: "printpress", expenseDate: { gte: startOfDay, lt: endOfDay } }, _sum: { amount: true } }),
        this.prisma.printPressInvoice.aggregate({
          where: { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] }, createdAt: { gte: startOfMonth, lt: endOfMonth } },
          _sum: { total: true }
        }),
        this.prisma.printPressExpense.aggregate({ where: { tenantId, moduleId: "printpress", expenseDate: { gte: startOfMonth, lt: endOfMonth } }, _sum: { amount: true } }),
        this.prisma.printPressInvoice.aggregate({
          where: { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] }, createdAt: { gte: startOfMonth, lt: endOfMonth } },
          _sum: { tax: true }
        }),
        this.prisma.printPressJob.count({
          where: { tenantId, moduleId: "printpress", status: { in: ["received", "designing", "customer_approval", "printing", "finishing", "packaging", "ready"] } }
        }),
        this.prisma.printPressJob.count({ where: { tenantId, moduleId: "printpress", status: "delivered" } }),
        this.prisma.printPressJob.count({
          where: {
            tenantId,
            moduleId: "printpress",
            priority: "urgent",
            status: { in: ["received", "designing", "customer_approval", "printing", "finishing", "packaging", "ready"] }
          }
        }),
        this.prisma.printPressInvoice.count({ where: { tenantId, moduleId: "printpress", status: "issued" } })
      ]);

    const todayIncome = todayIncomeAgg._sum.amount ?? new Prisma.Decimal(0);
    const todayExpenses = todayExpensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const monthlyRevenue = monthRevenueAgg._sum.total ?? new Prisma.Decimal(0);
    const monthlyExpenses = monthExpensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const taxSummary = monthTaxAgg._sum.tax ?? new Prisma.Decimal(0);
    const profitSummary = monthlyRevenue.sub(monthlyExpenses);

    return {
      data: {
        todayIncome: todayIncome.toString(),
        todayExpenses: todayExpenses.toString(),
        monthlyRevenue: monthlyRevenue.toString(),
        pendingPayments,
        pendingJobs,
        completedJobs,
        urgentOrders,
        lowStockAlerts: 0,
        profitSummary: profitSummary.toString(),
        taxSummary: taxSummary.toString()
      }
    };
  }

  @Get("dashboard/trends")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.dashboard.view")
  async dashboardTrends(@Req() req: { tenantId: string }, @Query() query: { days?: string }) {
    const tenantId = req.tenantId;
    const rawDays = Number((query.days ?? "").trim());
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.max(7, Math.trunc(rawDays))) : 30;

    const endExclusive = new Date();
    endExclusive.setHours(0, 0, 0, 0);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const start = new Date(endExclusive);
    start.setDate(start.getDate() - days);

    const [invoices, expenses] = await Promise.all([
      this.prisma.printPressInvoice.findMany({
        where: { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] }, createdAt: { gte: start, lt: endExclusive } },
        select: { createdAt: true, total: true }
      }),
      this.prisma.printPressExpense.findMany({
        where: { tenantId, moduleId: "printpress", expenseDate: { gte: start, lt: endExclusive } },
        select: { expenseDate: true, amount: true }
      })
    ]);

    const revenueByDay = new Map<string, Prisma.Decimal>();
    const expenseByDay = new Map<string, Prisma.Decimal>();

    for (const inv of invoices) {
      const key = inv.createdAt.toISOString().slice(0, 10);
      const cur = revenueByDay.get(key) ?? new Prisma.Decimal(0);
      revenueByDay.set(key, cur.add(inv.total));
    }
    for (const e of expenses) {
      const key = e.expenseDate.toISOString().slice(0, 10);
      const cur = expenseByDay.get(key) ?? new Prisma.Decimal(0);
      expenseByDay.set(key, cur.add(e.amount));
    }

    const items: Array<{ date: string; revenue: string; expenses: string }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      items.push({
        date: key,
        revenue: (revenueByDay.get(key) ?? new Prisma.Decimal(0)).toString(),
        expenses: (expenseByDay.get(key) ?? new Prisma.Decimal(0)).toString()
      });
    }

    return { data: { days, from: items[0]?.date ?? null, to: items[items.length - 1]?.date ?? null, items } };
  }

  @Get("dashboard/analytics")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.dashboard.view")
  async dashboardAnalytics(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;

    const [jobStatusRows, customerInvoiceAgg] = await Promise.all([
      this.prisma.printPressJob.groupBy({
        by: ["status"],
        where: { tenantId, moduleId: "printpress" },
        _count: { _all: true }
      }),
      this.prisma.printPressInvoice.groupBy({
        by: ["customerId"],
        where: { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] }, customerId: { not: null } },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
        take: 8
      })
    ]);

    const jobStatus = jobStatusRows
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);

    const customerIds = customerInvoiceAgg.map((r) => r.customerId).filter((id): id is string => typeof id === "string");
    const customers =
      customerIds.length === 0
        ? []
        : await this.prisma.printPressCustomer.findMany({
            where: { tenantId, moduleId: "printpress", id: { in: customerIds } },
            select: { id: true, fullName: true, companyName: true }
          });
    const customerById = new Map(customers.map((c) => [c.id, c] as const));

    const topCustomers = customerInvoiceAgg.map((r) => {
      const customer = r.customerId ? (customerById.get(r.customerId) ?? null) : null;
      return {
        customerId: r.customerId,
        fullName: customer?.fullName ?? "—",
        companyName: customer?.companyName ?? null,
        invoicesCount: r._count._all,
        totalInvoiced: (r._sum.total ?? new Prisma.Decimal(0)).toString()
      };
    });

    return { data: { jobStatus, topCustomers } };
  }

  @Get("dashboard/inventory-usage")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.dashboard.view")
  async dashboardInventoryUsage(@Req() req: { tenantId: string }, @Query() query: { days?: string }) {
    const tenantId = req.tenantId;
    const rawDays = Number((query.days ?? "").trim());
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.max(7, Math.trunc(rawDays))) : 30;

    const endExclusive = new Date();
    endExclusive.setHours(0, 0, 0, 0);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const start = new Date(endExclusive);
    start.setDate(start.getDate() - days);

    const tokens = ["paper", "ink", "toner", "vinyl", "flex", "pack", "binding", "material", "accessor"];
    const grouped = await this.prisma.printPressExpense.groupBy({
      by: ["category"],
      where: {
        tenantId,
        moduleId: "printpress",
        expenseDate: { gte: start, lt: endExclusive },
        OR: tokens.map((t) => ({ category: { contains: t, mode: "insensitive" } }))
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10
    });

    const items = grouped.map((g) => ({ category: g.category, amount: (g._sum.amount ?? new Prisma.Decimal(0)).toString() }));
    const total = items.reduce((acc, i) => acc.add(new Prisma.Decimal(i.amount || "0")), new Prisma.Decimal(0));

    return { data: { days, from: start.toISOString().slice(0, 10), to: new Date(endExclusive.getTime() - 1).toISOString().slice(0, 10), items, total: total.toString() } };
  }

  @Get("settings")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.settings.view")
  async getSettings(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;

    let row = await this.prisma.printPressSettings.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        businessName: true,
        logoFileId: true,
        phone: true,
        address: true,
        email: true,
        taxNumber: true,
        defaultCurrencyCode: true,
        nextJobNumber: true,
        nextQuotationNumber: true,
        nextInvoiceNumber: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!row) {
      row = await this.prisma.printPressSettings.create({
        data: { tenantId },
        select: {
          tenantId: true,
          businessName: true,
          logoFileId: true,
          phone: true,
          address: true,
          email: true,
          taxNumber: true,
          defaultCurrencyCode: true,
          nextJobNumber: true,
          nextQuotationNumber: true,
          nextInvoiceNumber: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    return {
      data: {
        tenantId: row.tenantId,
        businessName: row.businessName,
        logoFileId: row.logoFileId,
        logoUrl: row.logoFileId ? `/api/files/${row.logoFileId}` : null,
        phone: row.phone,
        address: row.address,
        email: row.email,
        taxNumber: row.taxNumber,
        defaultCurrencyCode: row.defaultCurrencyCode,
        nextJobNumber: row.nextJobNumber,
        nextQuotationNumber: row.nextQuotationNumber,
        nextInvoiceNumber: row.nextInvoiceNumber,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }
    };
  }

  @Patch("settings")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.settings.manage")
  async updateSettings(@Req() req: { tenantId: string }, @Body() body: UpdatePrintPressSettingsDto) {
    const tenantId = req.tenantId;

    const updateData: Prisma.PrintPressSettingsUncheckedUpdateInput = {};
    const createData: Prisma.PrintPressSettingsUncheckedCreateInput = { tenantId };
    let hasAnyUpdate = false;

    if (body.businessName !== undefined) {
      const v = body.businessName.trim() || null;
      updateData.businessName = v;
      createData.businessName = v;
      hasAnyUpdate = true;
    }
    if (body.logoFileId !== undefined) {
      const v = body.logoFileId.trim() || null;
      updateData.logoFileId = v;
      createData.logoFileId = v;
      hasAnyUpdate = true;
    }
    if (body.phone !== undefined) {
      const v = body.phone.trim() || null;
      updateData.phone = v;
      createData.phone = v;
      hasAnyUpdate = true;
    }
    if (body.address !== undefined) {
      const v = body.address.trim() || null;
      updateData.address = v;
      createData.address = v;
      hasAnyUpdate = true;
    }
    if (body.email !== undefined) {
      const v = body.email.trim() || null;
      updateData.email = v;
      createData.email = v;
      hasAnyUpdate = true;
    }
    if (body.taxNumber !== undefined) {
      const v = body.taxNumber.trim() || null;
      updateData.taxNumber = v;
      createData.taxNumber = v;
      hasAnyUpdate = true;
    }
    if (body.defaultCurrencyCode !== undefined) {
      const code = body.defaultCurrencyCode.trim().toUpperCase();
      const v = code || "USD";
      updateData.defaultCurrencyCode = v;
      createData.defaultCurrencyCode = v;
      hasAnyUpdate = true;
    }

    if (!hasAnyUpdate) {
      const existing = await this.prisma.printPressSettings.findUnique({ where: { tenantId }, select: { tenantId: true } });
      if (!existing) await this.prisma.printPressSettings.create({ data: { tenantId }, select: { tenantId: true } });
      return { data: { success: true } };
    }

    await this.prisma.printPressSettings.upsert({
      where: { tenantId },
      update: updateData,
      create: createData
    });

    return { data: { success: true } };
  }

  @Get("customers")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.view")
  async listCustomers(@Req() req: { tenantId: string }, @Query() query: ListPrintPressCustomersQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status === "archived" ? "archived" : "active";

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (status === "active") where.deletedAt = null;
    else where.deletedAt = { not: null };
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressCustomer.count({ where }),
      this.prisma.printPressCustomer.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          companyName: true,
          customerType: true,
          phone: true,
          email: true,
          address: true,
          taxNumber: true,
          notes: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          companyName: c.companyName,
          customerType: c.customerType,
          phone: c.phone,
          email: c.email,
          address: c.address,
          taxNumber: c.taxNumber,
          notes: c.notes,
          status: c.deletedAt ? "archived" : "active",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("customers")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async createCustomer(@Req() req: { tenantId: string }, @Body() body: UpsertPrintPressCustomerDto) {
    const tenantId = req.tenantId;
    const fullName = body.fullName?.trim();
    if (!fullName) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    const row = await this.prisma.printPressCustomer.create({
      data: {
        tenantId,
        moduleId: "printpress",
        fullName,
        companyName: body.companyName?.trim() || null,
        customerType: body.customerType ?? null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        taxNumber: body.taxNumber?.trim() || null,
        notes: body.notes?.trim() || null
      },
      select: { id: true }
    });

    return { data: { id: row.id } };
  }

  @Patch("customers/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async updateCustomer(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressCustomerDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const fullName = body.fullName?.trim();
    if (!fullName) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    await this.prisma.printPressCustomer.update({
      where: { id },
      data: {
        fullName,
        companyName: body.companyName?.trim() || null,
        customerType: body.customerType ?? null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        taxNumber: body.taxNumber?.trim() || null,
        notes: body.notes?.trim() || null
      }
    });

    return { data: { success: true } };
  }

  @Delete("customers/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async archiveCustomer(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressCustomer.update({ where: { id }, data: { deletedAt: new Date() } });
    return { data: { success: true } };
  }

  @Post("customers/:id/restore")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async restoreCustomer(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressCustomer.update({ where: { id }, data: { deletedAt: null } });
    return { data: { success: true } };
  }

  @Get("customers/:id/attachments")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.view")
  async listCustomerAttachments(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const customer = await this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const rows = await this.prisma.printPressCustomerAttachment.findMany({
      where: { tenantId, customerId: id },
      select: { id: true, createdAt: true, file: { select: { id: true, originalName: true, contentType: true, sizeBytes: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      data: {
        items: rows.map((r) => ({
          id: r.id,
          fileId: r.file.id,
          fileUrl: `/api/files/${r.file.id}`,
          originalName: r.file.originalName,
          contentType: r.file.contentType,
          sizeBytes: r.file.sizeBytes,
          createdAt: r.createdAt
        }))
      }
    };
  }

  @Post("customers/:id/attachments")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async addCustomerAttachment(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: { fileId?: string }) {
    const tenantId = req.tenantId;
    const fileId = (body.fileId ?? "").trim();
    if (!fileId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    const [customer, file] = await Promise.all([
      this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } }),
      this.prisma.file.findUnique({ where: { id: fileId }, select: { id: true, tenantId: true } })
    ]);
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (!file || file.tenantId !== tenantId) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const row = await this.prisma.printPressCustomerAttachment.upsert({
      where: { tenantId_customerId_fileId: { tenantId, customerId: id, fileId } },
      update: {},
      create: { tenantId, customerId: id, fileId },
      select: { id: true }
    });

    return { data: { id: row.id } };
  }

  @Delete("customers/:id/attachments/:attachmentId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.manage")
  async deleteCustomerAttachment(@Req() req: { tenantId: string }, @Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const tenantId = req.tenantId;
    const customer = await this.prisma.printPressCustomer.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const existing = await this.prisma.printPressCustomerAttachment.findFirst({ where: { tenantId, id: attachmentId, customerId: id }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressCustomerAttachment.delete({ where: { id: attachmentId } });
    return { data: { success: true } };
  }

  @Get("customers/lookup")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.view")
  async lookupCustomers(@Req() req: { tenantId: string }, @Query() query: { q?: string }) {
    const tenantId = req.tenantId;
    const q = query.q?.trim() || null;

    const where: Record<string, unknown> = { tenantId, moduleId: "printpress", deletedAt: null };
    if (q) where.fullName = { contains: q, mode: "insensitive" };

    const items = await this.prisma.printPressCustomer.findMany({
      where,
      select: { id: true, fullName: true, companyName: true, phone: true },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      take: 20
    });

    return {
      data: {
        items: items.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          companyName: c.companyName,
          phone: c.phone
        }))
      }
    };
  }

  @Get("customers/:id/ledger")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.view")
  async getCustomerLedger(@Req() req: { tenantId: string }, @Param("id") id: string, @Query() query: { from?: string; to?: string }) {
    const tenantId = req.tenantId;
    const customer = await this.prisma.printPressCustomer.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: { id: true, fullName: true, companyName: true, customerType: true, phone: true, email: true, address: true, taxNumber: true, deletedAt: true }
    });
    if (!customer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const from = parseDateOnlyOrNull(query.from);
    const toExclusive = parseDateOnlyExclusiveOrNull(query.to);

    const effectiveFrom = from ?? (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - 90);
      return d;
    })();
    const effectiveToExclusive =
      toExclusive ??
      (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 1);
        return d;
      })();

    const invoiceBaseWhere: Record<string, unknown> = { tenantId, moduleId: "printpress", customerId: id, status: { in: ["issued", "paid"] } };

    const [invBeforeAgg, payBeforeAgg] = await Promise.all([
      this.prisma.printPressInvoice.aggregate({
        where: { ...invoiceBaseWhere, createdAt: { lt: effectiveFrom } },
        _sum: { total: true }
      }),
      this.prisma.printPressInvoicePayment.aggregate({
        where: { tenantId, createdAt: { lt: effectiveFrom }, invoice: { is: { tenantId, moduleId: "printpress", customerId: id } } },
        _sum: { amount: true }
      })
    ]);

    const openingDebit = invBeforeAgg._sum.total ?? new Prisma.Decimal(0);
    const openingCredit = payBeforeAgg._sum.amount ?? new Prisma.Decimal(0);
    const openingBalance = openingDebit.sub(openingCredit);

    const [invoices, payments, recentJobs, recentQuotations, recentInvoices] = await Promise.all([
      this.prisma.printPressInvoice.findMany({
        where: { ...invoiceBaseWhere, createdAt: { gte: effectiveFrom, lt: effectiveToExclusive } },
        select: { id: true, invoiceNumber: true, status: true, total: true, paidTotal: true, createdAt: true, issuedAt: true }
      }),
      this.prisma.printPressInvoicePayment.findMany({
        where: { tenantId, createdAt: { gte: effectiveFrom, lt: effectiveToExclusive }, invoice: { is: { tenantId, moduleId: "printpress", customerId: id } } },
        select: { id: true, method: true, amount: true, note: true, createdAt: true, invoice: { select: { id: true, invoiceNumber: true } } },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.printPressJob.findMany({
        where: { tenantId, moduleId: "printpress", customerId: id },
        select: { id: true, jobNumber: true, status: true, priority: true, title: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.printPressQuotation.findMany({
        where: { tenantId, moduleId: "printpress", customerId: id },
        select: { id: true, quotationNumber: true, status: true, total: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.printPressInvoice.findMany({
        where: { tenantId, moduleId: "printpress", customerId: id },
        select: { id: true, invoiceNumber: true, status: true, total: true, paidTotal: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5
      })
    ]);

    type LedgerItem =
      | { type: "invoice"; at: Date; invoiceId: string; ref: string; status: string; debit: Prisma.Decimal; credit: Prisma.Decimal; note: string | null }
      | { type: "payment"; at: Date; invoiceId: string; paymentId: string; ref: string; method: string; debit: Prisma.Decimal; credit: Prisma.Decimal; note: string | null };

    const ledgerItems: LedgerItem[] = [
      ...invoices.map((i) => ({
        type: "invoice" as const,
        at: i.createdAt,
        invoiceId: i.id,
        ref: i.invoiceNumber ?? i.id,
        status: i.status,
        debit: i.total,
        credit: new Prisma.Decimal(0),
        note: null
      })),
      ...payments.map((p) => ({
        type: "payment" as const,
        at: p.createdAt,
        invoiceId: p.invoice.id,
        paymentId: p.id,
        ref: p.invoice.invoiceNumber ?? p.invoice.id,
        method: p.method,
        debit: new Prisma.Decimal(0),
        credit: p.amount,
        note: p.note
      }))
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    let running = openingBalance;
    const timeline = ledgerItems.map((it) => {
      if (it.type === "invoice") running = running.add(it.debit);
      else running = running.sub(it.credit);
      return {
        type: it.type,
        at: it.at.toISOString(),
        invoiceId: it.invoiceId,
        paymentId: it.type === "payment" ? it.paymentId : null,
        ref: it.ref,
        status: it.type === "invoice" ? it.status : null,
        method: it.type === "payment" ? it.method : null,
        debit: it.debit.toString(),
        credit: it.credit.toString(),
        balance: running.toString(),
        note: it.note
      };
    });

    const periodDebit = invoices.reduce((acc, i) => acc.add(i.total), new Prisma.Decimal(0));
    const periodCredit = payments.reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));
    const closingBalance = openingBalance.add(periodDebit).sub(periodCredit);

    const allInvAgg = await this.prisma.printPressInvoice.aggregate({ where: invoiceBaseWhere, _sum: { total: true } });
    const allPayAgg = await this.prisma.printPressInvoicePayment.aggregate({
      where: { tenantId, invoice: { is: { tenantId, moduleId: "printpress", customerId: id } } },
      _sum: { amount: true }
    });
    const totalInvoiced = allInvAgg._sum.total ?? new Prisma.Decimal(0);
    const totalPaid = allPayAgg._sum.amount ?? new Prisma.Decimal(0);
    const balanceDue = totalInvoiced.sub(totalPaid);

    return {
      data: {
        customer: {
          id: customer.id,
          fullName: customer.fullName,
          companyName: customer.companyName,
          customerType: customer.customerType,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          taxNumber: customer.taxNumber,
          status: customer.deletedAt ? "archived" : "active"
        },
        range: { from: effectiveFrom.toISOString().slice(0, 10), to: new Date(effectiveToExclusive.getTime() - 1).toISOString().slice(0, 10) },
        totals: {
          openingBalance: openingBalance.toString(),
          periodInvoiced: periodDebit.toString(),
          periodPaid: periodCredit.toString(),
          closingBalance: closingBalance.toString(),
          totalInvoiced: totalInvoiced.toString(),
          totalPaid: totalPaid.toString(),
          balanceDue: balanceDue.toString()
        },
        timeline,
        recent: {
          jobs: recentJobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, status: j.status, priority: j.priority, title: j.title, createdAt: j.createdAt, updatedAt: j.updatedAt })),
          quotations: recentQuotations.map((q) => ({ id: q.id, quotationNumber: q.quotationNumber, status: q.status, total: q.total.toString(), createdAt: q.createdAt, updatedAt: q.updatedAt })),
          invoices: recentInvoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            total: inv.total.toString(),
            paidTotal: inv.paidTotal.toString(),
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt
          }))
        }
      }
    };
  }

  @Get("jobs")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.jobs.view")
  async listJobs(@Req() req: { tenantId: string }, @Query() query: ListPrintPressJobsQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status ?? null;
    const priority = query.priority ?? null;

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (q) {
      where.OR = [{ title: { contains: q, mode: "insensitive" } }, { jobNumber: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressJob.count({ where }),
      this.prisma.printPressJob.findMany({
        where,
        select: {
          id: true,
          jobNumber: true,
          status: true,
          priority: true,
          title: true,
          description: true,
          orderDate: true,
          deliveryDate: true,
          customerId: true,
          customer: { select: { id: true, fullName: true } },
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return { data: { items, page, pageSize, total } };
  }

  @Post("jobs")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.jobs.manage")
  async createJob(@Req() req: { tenantId: string }, @Body() body: CreatePrintPressJobDto) {
    const tenantId = req.tenantId;
    const row = await this.prisma.$transaction(async (tx) => {
      const jobNumber = await reservePrintPressJobNumber(tx, tenantId);
      return tx.printPressJob.create({
        data: {
          tenantId,
          moduleId: "printpress",
          jobNumber,
          customerId: body.customerId ?? null,
          status: body.status ?? undefined,
          priority: body.priority ?? undefined,
          title: body.title?.trim() || null,
          description: body.description?.trim() || null
        },
        select: { id: true }
      });
    });
    return { data: { id: row.id } };
  }

  @Patch("jobs/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.jobs.manage")
  async updateJob(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdatePrintPressJobDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressJob.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.printPressJob.update({
      where: { id },
      data: {
        status: body.status ?? undefined,
        priority: body.priority ?? undefined,
        customerId: body.customerId === undefined ? undefined : body.customerId,
        title: body.title === undefined ? undefined : body.title?.trim() || null,
        description: body.description === undefined ? undefined : body.description?.trim() || null
      }
    });

    return { data: { success: true } };
  }

  @Get("quotations")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.view")
  async listQuotations(@Req() req: { tenantId: string }, @Query() query: ListPrintPressQuotationsQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status ?? null;

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { quotationNumber: { contains: q, mode: "insensitive" } },
        { customer: { is: { fullName: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressQuotation.count({ where }),
      this.prisma.printPressQuotation.findMany({
        where,
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          currencyCode: true,
          subtotal: true,
          discount: true,
          tax: true,
          total: true,
          createdAt: true,
          updatedAt: true,
          issuedAt: true,
          customer: { select: { id: true, fullName: true } }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((qRow) => ({
          id: qRow.id,
          quotationNumber: qRow.quotationNumber,
          status: qRow.status,
          currencyCode: qRow.currencyCode,
          subtotal: qRow.subtotal.toString(),
          discount: qRow.discount.toString(),
          tax: qRow.tax.toString(),
          total: qRow.total.toString(),
          createdAt: qRow.createdAt,
          updatedAt: qRow.updatedAt,
          issuedAt: qRow.issuedAt,
          customer: qRow.customer
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("quotations")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async createQuotation(@Req() req: { tenantId: string }, @Body() body: CreatePrintPressQuotationDto) {
    const tenantId = req.tenantId;
    const discount = parseDecimalOrZero(body.discount);
    const tax = parseDecimalOrZero(body.tax);
    const row = await this.prisma.$transaction(async (tx) => {
      const quotationNumber = await reservePrintPressQuotationNumber(tx, tenantId);
      const currencyCode = body.currencyCode?.trim() || (await getPrintPressDefaultCurrencyCode(tx, tenantId));
      const created = await tx.printPressQuotation.create({
        data: {
          tenantId,
          moduleId: "printpress",
          status: "draft",
          quotationNumber,
          customerId: body.customerId ?? null,
          currencyCode,
          notes: body.notes?.trim() || null,
          discount,
          tax
        },
        select: { id: true }
      });
      await recalcQuotationTotals(tx, tenantId, created.id);
      return created;
    });
    return { data: { id: row.id } };
  }

  @Get("quotations/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.view")
  async getQuotation(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const qRow = await this.prisma.printPressQuotation.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        quotationNumber: true,
        status: true,
        currencyCode: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        notes: true,
        issuedAt: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, fullName: true } },
        lines: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } }
      }
    });
    if (!qRow) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: qRow.id,
        quotationNumber: qRow.quotationNumber,
        status: qRow.status,
        currencyCode: qRow.currencyCode,
        subtotal: qRow.subtotal.toString(),
        discount: qRow.discount.toString(),
        tax: qRow.tax.toString(),
        total: qRow.total.toString(),
        notes: qRow.notes,
        issuedAt: qRow.issuedAt,
        createdAt: qRow.createdAt,
        updatedAt: qRow.updatedAt,
        customer: qRow.customer,
        lines: qRow.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString()
        }))
      }
    };
  }

  @Get("quotations/:id/pdf")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.view")
  async getQuotationPdf(@Req() req: { tenantId: string }, @Param("id") id: string, @Res() res: Response) {
    const tenantId = req.tenantId;
    const quotation = await this.prisma.printPressQuotation.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        quotationNumber: true,
        status: true,
        currencyCode: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        notes: true,
        issuedAt: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, fullName: true } },
        lines: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } }
      }
    });
    if (!quotation) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const settings = await this.prisma.printPressSettings.findUnique({
      where: { tenantId },
      select: { businessName: true, phone: true, address: true, email: true, taxNumber: true, logoFileId: true }
    });

    const logoBuffer = settings?.logoFileId ? await loadTenantFileBuffer(this.prisma, tenantId, settings.logoFileId) : null;

    const pdf = await buildPrintPressQuotationPdf({
      title: "Quotation",
      logoBuffer,
      businessName: settings?.businessName ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      address: settings?.address ?? null,
      taxNumber: settings?.taxNumber ?? null,
      quotation: {
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        currencyCode: quotation.currencyCode,
        subtotal: quotation.subtotal.toString(),
        discount: quotation.discount.toString(),
        tax: quotation.tax.toString(),
        total: quotation.total.toString(),
        notes: quotation.notes,
        issuedAt: quotation.issuedAt,
        createdAt: quotation.createdAt,
        customerName: quotation.customer?.fullName ?? null,
        lines: quotation.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString()
        }))
      }
    });

    const number = quotation.quotationNumber ?? quotation.id;
    const filename = `Quotation-${safeFilename(number)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Patch("quotations/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async updateQuotation(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdatePrintPressQuotationDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressQuotation.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const defaultCurrencyCode = body.currencyCode === undefined ? null : await getPrintPressDefaultCurrencyCode(this.prisma, tenantId);
    await this.prisma.printPressQuotation.update({
      where: { id },
      data: {
        customerId: body.customerId === undefined ? undefined : body.customerId,
        currencyCode: body.currencyCode === undefined ? undefined : (body.currencyCode?.trim() || defaultCurrencyCode || "USD"),
        notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
        discount: body.discount === undefined ? undefined : parseDecimalOrZero(body.discount),
        tax: body.tax === undefined ? undefined : parseDecimalOrZero(body.tax)
      }
    });

    await recalcQuotationTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Post("quotations/:id/lines")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async addQuotationLine(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressQuotationLineDto) {
    const tenantId = req.tenantId;
    const quotation = await this.prisma.printPressQuotation.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!quotation) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const quantity = parseDecimalOrZero(body.quantity);
    const unitPrice = parseDecimalOrZero(body.unitPrice);
    const lineTotal = quantity.mul(unitPrice);

    await this.prisma.printPressQuotationLine.create({
      data: { tenantId, quotationId: id, description: body.description.trim(), quantity, unitPrice, lineTotal }
    });

    await recalcQuotationTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Patch("quotations/:id/lines/:lineId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async updateQuotationLine(
    @Req() req: { tenantId: string },
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: UpsertPrintPressQuotationLineDto
  ) {
    const tenantId = req.tenantId;
    const line = await this.prisma.printPressQuotationLine.findFirst({ where: { tenantId, id: lineId, quotationId: id }, select: { id: true } });
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const quantity = parseDecimalOrZero(body.quantity);
    const unitPrice = parseDecimalOrZero(body.unitPrice);
    const lineTotal = quantity.mul(unitPrice);

    await this.prisma.printPressQuotationLine.update({
      where: { id: lineId },
      data: { description: body.description.trim(), quantity, unitPrice, lineTotal }
    });

    await recalcQuotationTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Delete("quotations/:id/lines/:lineId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async deleteQuotationLine(@Req() req: { tenantId: string }, @Param("id") id: string, @Param("lineId") lineId: string) {
    const tenantId = req.tenantId;
    const line = await this.prisma.printPressQuotationLine.findFirst({ where: { tenantId, id: lineId, quotationId: id }, select: { id: true } });
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressQuotationLine.delete({ where: { id: lineId } });
    await recalcQuotationTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Post("quotations/:id/issue")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async issueQuotation(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const qRow = await this.prisma.printPressQuotation.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!qRow) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (qRow.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    await this.prisma.printPressQuotation.update({ where: { id }, data: { status: "issued", issuedAt: new Date() } });
    return { data: { success: true } };
  }

  @Post("quotations/:id/void")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.quotations.manage")
  async voidQuotation(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const qRow = await this.prisma.printPressQuotation.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!qRow) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressQuotation.update({ where: { id }, data: { status: "void" } });
    return { data: { success: true } };
  }

  @Post("quotations/:id/convert-to-invoice")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async convertQuotationToInvoice(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const qRow = await this.prisma.printPressQuotation.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        customerId: true,
        currencyCode: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        lines: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true } }
      }
    });
    if (!qRow) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await reservePrintPressInvoiceNumber(tx, tenantId);
      const created = await tx.printPressInvoice.create({
        data: {
          tenantId,
          moduleId: "printpress",
          status: "draft",
          invoiceNumber,
          quotationId: qRow.id,
          customerId: qRow.customerId,
          currencyCode: qRow.currencyCode,
          subtotal: qRow.subtotal,
          discount: qRow.discount,
          tax: qRow.tax,
          total: qRow.total,
          paidTotal: new Prisma.Decimal(0)
        },
        select: { id: true }
      });

      if (qRow.lines.length > 0) {
        await tx.printPressInvoiceLine.createMany({
          data: qRow.lines.map((l) => ({
            tenantId,
            invoiceId: created.id,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal
          }))
        });
      }

      return created;
    });

    return { data: { id: invoice.id } };
  }

  @Get("invoices")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.view")
  async listInvoices(@Req() req: { tenantId: string }, @Query() query: ListPrintPressInvoicesQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status ?? null;

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (status) where.status = status;
    if (q) {
      where.OR = [{ invoiceNumber: { contains: q, mode: "insensitive" } }, { customer: { is: { fullName: { contains: q, mode: "insensitive" } } } }];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressInvoice.count({ where }),
      this.prisma.printPressInvoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currencyCode: true,
          total: true,
          paidTotal: true,
          createdAt: true,
          updatedAt: true,
          issuedAt: true,
          customer: { select: { id: true, fullName: true } }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          currencyCode: i.currencyCode,
          total: i.total.toString(),
          paidTotal: i.paidTotal.toString(),
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          issuedAt: i.issuedAt,
          customer: i.customer
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("invoices")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async createInvoice(@Req() req: { tenantId: string }, @Body() body: CreatePrintPressInvoiceDto) {
    const tenantId = req.tenantId;
    const discount = parseDecimalOrZero(body.discount);
    const tax = parseDecimalOrZero(body.tax);
    const dueAt = body.dueAt ? parseDateTimeOrNull(body.dueAt) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await reservePrintPressInvoiceNumber(tx, tenantId);
      const currencyCode = body.currencyCode?.trim() || (await getPrintPressDefaultCurrencyCode(tx, tenantId));
      const row = await tx.printPressInvoice.create({
        data: {
          tenantId,
          moduleId: "printpress",
          status: "draft",
          invoiceNumber,
          customerId: body.customerId ?? null,
          currencyCode,
          discount,
          tax,
          dueAt,
          notes: body.notes?.trim() || null,
          paidTotal: new Prisma.Decimal(0)
        },
        select: { id: true }
      });
      await recalcInvoiceTotals(tx, tenantId, row.id);
      return row;
    });

    return { data: { id: created.id } };
  }

  @Patch("invoices/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async updateInvoice(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdatePrintPressInvoiceDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (existing.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const defaultCurrencyCode = body.currencyCode === undefined ? null : await getPrintPressDefaultCurrencyCode(this.prisma, tenantId);
    await this.prisma.printPressInvoice.update({
      where: { id },
      data: {
        customerId: body.customerId === undefined ? undefined : body.customerId,
        currencyCode: body.currencyCode === undefined ? undefined : (body.currencyCode?.trim() || defaultCurrencyCode || "USD"),
        notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
        discount: body.discount === undefined ? undefined : parseDecimalOrZero(body.discount),
        tax: body.tax === undefined ? undefined : parseDecimalOrZero(body.tax),
        dueAt: body.dueAt === undefined ? undefined : (body.dueAt ? parseDateTimeOrNull(body.dueAt) : null)
      }
    });

    await recalcInvoiceTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Post("invoices/:id/lines")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async addInvoiceLine(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressInvoiceLineDto) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const quantity = parseDecimalOrZero(body.quantity);
    const unitPrice = parseDecimalOrZero(body.unitPrice);
    const lineTotal = quantity.mul(unitPrice);

    await this.prisma.printPressInvoiceLine.create({
      data: { tenantId, invoiceId: id, description: body.description.trim(), quantity, unitPrice, lineTotal }
    });

    await recalcInvoiceTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Patch("invoices/:id/lines/:lineId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async updateInvoiceLine(
    @Req() req: { tenantId: string },
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: UpsertPrintPressInvoiceLineDto
  ) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const line = await this.prisma.printPressInvoiceLine.findFirst({ where: { tenantId, id: lineId, invoiceId: id }, select: { id: true } });
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const quantity = parseDecimalOrZero(body.quantity);
    const unitPrice = parseDecimalOrZero(body.unitPrice);
    const lineTotal = quantity.mul(unitPrice);

    await this.prisma.printPressInvoiceLine.update({
      where: { id: lineId },
      data: { description: body.description.trim(), quantity, unitPrice, lineTotal }
    });

    await recalcInvoiceTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Delete("invoices/:id/lines/:lineId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async deleteInvoiceLine(@Req() req: { tenantId: string }, @Param("id") id: string, @Param("lineId") lineId: string) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const line = await this.prisma.printPressInvoiceLine.findFirst({ where: { tenantId, id: lineId, invoiceId: id }, select: { id: true } });
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.printPressInvoiceLine.delete({ where: { id: lineId } });
    await recalcInvoiceTotals(this.prisma, tenantId, id);
    return { data: { success: true } };
  }

  @Get("invoices/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.view")
  async getInvoice(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currencyCode: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paidTotal: true,
        notes: true,
        issuedAt: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, fullName: true } },
        lines: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
        payments: { select: { id: true, method: true, amount: true, note: true, createdAt: true }, orderBy: { createdAt: "desc" } }
      }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        subtotal: invoice.subtotal.toString(),
        discount: invoice.discount.toString(),
        tax: invoice.tax.toString(),
        total: invoice.total.toString(),
        paidTotal: invoice.paidTotal.toString(),
        notes: invoice.notes,
        issuedAt: invoice.issuedAt,
        dueAt: invoice.dueAt,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        customer: invoice.customer,
        lines: invoice.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString()
        })),
        payments: invoice.payments.map((p) => ({ id: p.id, method: p.method, amount: p.amount.toString(), note: p.note, createdAt: p.createdAt }))
      }
    };
  }

  @Get("invoices/:id/pdf")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.view")
  async getInvoicePdf(@Req() req: { tenantId: string }, @Param("id") id: string, @Res() res: Response) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currencyCode: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paidTotal: true,
        notes: true,
        issuedAt: true,
        dueAt: true,
        createdAt: true,
        customer: { select: { id: true, fullName: true } },
        lines: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } }
      }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const settings = await this.prisma.printPressSettings.findUnique({
      where: { tenantId },
      select: { businessName: true, phone: true, address: true, email: true, taxNumber: true, logoFileId: true }
    });

    const logoBuffer = settings?.logoFileId ? await loadTenantFileBuffer(this.prisma, tenantId, settings.logoFileId) : null;

    const pdf = await buildPrintPressInvoicePdf({
      title: "Invoice",
      logoBuffer,
      businessName: settings?.businessName ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      address: settings?.address ?? null,
      taxNumber: settings?.taxNumber ?? null,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        subtotal: invoice.subtotal.toString(),
        discount: invoice.discount.toString(),
        tax: invoice.tax.toString(),
        total: invoice.total.toString(),
        paidTotal: invoice.paidTotal.toString(),
        notes: invoice.notes,
        issuedAt: invoice.issuedAt,
        dueAt: invoice.dueAt,
        createdAt: invoice.createdAt,
        customerName: invoice.customer?.fullName ?? null,
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString()
        }))
      }
    });

    const number = invoice.invoiceNumber ?? invoice.id;
    const filename = `Invoice-${safeFilename(number)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Get("invoices/:id/receipt/pdf")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.view")
  async getInvoiceReceiptPdf(@Req() req: { tenantId: string }, @Param("id") id: string, @Res() res: Response) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currencyCode: true,
        total: true,
        paidTotal: true,
        notes: true,
        issuedAt: true,
        createdAt: true,
        customer: { select: { id: true, fullName: true } },
        payments: { select: { id: true, method: true, amount: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const settings = await this.prisma.printPressSettings.findUnique({
      where: { tenantId },
      select: { businessName: true, phone: true, address: true, email: true, taxNumber: true, logoFileId: true }
    });

    const logoBuffer = settings?.logoFileId ? await loadTenantFileBuffer(this.prisma, tenantId, settings.logoFileId) : null;

    const pdf = await buildPrintPressReceiptPdf({
      title: "Receipt",
      logoBuffer,
      businessName: settings?.businessName ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      address: settings?.address ?? null,
      taxNumber: settings?.taxNumber ?? null,
      receipt: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        total: invoice.total.toString(),
        paidTotal: invoice.paidTotal.toString(),
        notes: invoice.notes,
        createdAt: invoice.createdAt,
        issuedAt: invoice.issuedAt,
        customerName: invoice.customer?.fullName ?? null,
        payments: invoice.payments.map((p) => ({ method: p.method, amount: p.amount.toString(), note: p.note, createdAt: p.createdAt }))
      }
    });

    const number = invoice.invoiceNumber ?? invoice.id;
    const filename = `Receipt-${safeFilename(number)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post("invoices/:id/issue")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async issueInvoice(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, status: true } });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    await this.prisma.printPressInvoice.update({ where: { id }, data: { status: "issued", issuedAt: new Date() } });
    return { data: { success: true } };
  }

  @Post("invoices/:id/void")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async voidInvoice(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressInvoice.update({ where: { id }, data: { status: "void" } });
    return { data: { success: true } };
  }

  @Post("invoices/:id/payments")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async addInvoicePayment(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: CreatePrintPressInvoicePaymentDto) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.printPressInvoice.findFirst({
      where: { tenantId, id, moduleId: "printpress" },
      select: { id: true, total: true, paidTotal: true, status: true }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    await this.prisma.$transaction(async (tx) => {
      await tx.printPressInvoicePayment.create({ data: { tenantId, invoiceId: id, method: body.method.trim(), amount, note: body.note?.trim() || null } });
      const agg = await tx.printPressInvoicePayment.aggregate({ where: { tenantId, invoiceId: id }, _sum: { amount: true } });
      const newPaidTotal = agg._sum.amount ?? new Prisma.Decimal(0);
      const newStatus = newPaidTotal.gte(invoice.total) ? "paid" : invoice.status === "draft" ? "draft" : "issued";
      await tx.printPressInvoice.update({ where: { id }, data: { paidTotal: newPaidTotal, status: newStatus } });
    });

    return { data: { success: true } };
  }

  @Patch("invoices/:id/payments/:paymentId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async updateInvoicePayment(
    @Req() req: { tenantId: string },
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() body: UpdatePrintPressInvoicePaymentDto
  ) {
    const tenantId = req.tenantId;
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, total: true, status: true } });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

      const payment = await tx.printPressInvoicePayment.findFirst({ where: { tenantId, id: paymentId, invoiceId: id }, select: { id: true } });
      if (!payment) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.printPressInvoicePayment.update({
        where: { id: paymentId },
        data: { method: body.method.trim(), amount, note: body.note?.trim() || null }
      });

      const agg = await tx.printPressInvoicePayment.aggregate({ where: { tenantId, invoiceId: id }, _sum: { amount: true } });
      const newPaidTotal = agg._sum.amount ?? new Prisma.Decimal(0);

      let newStatus: "draft" | "issued" | "paid" = invoice.status;
      if (invoice.status === "draft") newStatus = "draft";
      else newStatus = newPaidTotal.gte(invoice.total) ? "paid" : "issued";

      await tx.printPressInvoice.update({ where: { id }, data: { paidTotal: newPaidTotal, status: newStatus } });
    });

    return { data: { success: true } };
  }

  @Delete("invoices/:id/payments/:paymentId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.invoices.manage")
  async deleteInvoicePayment(@Req() req: { tenantId: string }, @Param("id") id: string, @Param("paymentId") paymentId: string) {
    const tenantId = req.tenantId;
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.printPressInvoice.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, total: true, status: true } });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status === "void") throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

      const payment = await tx.printPressInvoicePayment.findFirst({ where: { tenantId, id: paymentId, invoiceId: id }, select: { id: true } });
      if (!payment) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.printPressInvoicePayment.delete({ where: { id: paymentId } });
      const agg = await tx.printPressInvoicePayment.aggregate({ where: { tenantId, invoiceId: id }, _sum: { amount: true } });
      const newPaidTotal = agg._sum.amount ?? new Prisma.Decimal(0);

      let newStatus: "draft" | "issued" | "paid" = invoice.status;
      if (invoice.status === "draft") newStatus = "draft";
      else newStatus = newPaidTotal.gte(invoice.total) ? "paid" : "issued";

      await tx.printPressInvoice.update({ where: { id }, data: { paidTotal: newPaidTotal, status: newStatus } });
    });

    return { data: { success: true } };
  }

  @Get("expenses")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.view")
  async listExpenses(@Req() req: { tenantId: string }, @Query() query: ListPrintPressExpensesQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const from = parseDateOnlyOrNull(query.from);
    const toExclusive = parseDateOnlyExclusiveOrNull(query.to);

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (from || toExclusive) {
      where.expenseDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };
    }
    if (q) {
      where.OR = [{ category: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressExpense.count({ where }),
      this.prisma.printPressExpense.findMany({
        where,
        select: { id: true, expenseDate: true, supplierId: true, category: true, description: true, amount: true, createdAt: true, updatedAt: true, supplier: { select: { id: true, name: true } } },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((e) => ({
          id: e.id,
          expenseDate: e.expenseDate,
          supplierId: e.supplierId,
          supplierName: e.supplier?.name ?? null,
          category: e.category,
          description: e.description,
          amount: e.amount.toString(),
          createdAt: e.createdAt,
          updatedAt: e.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("expenses")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async createExpense(@Req() req: { tenantId: string }, @Body() body: UpsertPrintPressExpenseDto) {
    const tenantId = req.tenantId;
    const supplierId = body.supplierId?.trim() || null;
    if (supplierId) {
      const supplier = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "printpress" }, select: { id: true } });
      if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const expenseDate = parseDateTimeOrNow(body.expenseDate);

    const row = await this.prisma.printPressExpense.create({
      data: {
        tenantId,
        moduleId: "printpress",
        expenseDate,
        supplierId,
        category,
        description: body.description?.trim() || null,
        amount
      },
      select: { id: true }
    });

    return { data: { id: row.id } };
  }

  @Patch("expenses/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async updateExpense(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressExpenseDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, supplierId: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const supplierId = body.supplierId === undefined ? existing.supplierId : body.supplierId?.trim() || null;
    if (supplierId) {
      const supplier = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "printpress" }, select: { id: true } });
      if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const expenseDate = parseDateTimeOrNow(body.expenseDate);

    await this.prisma.printPressExpense.update({
      where: { id },
      data: { expenseDate, supplierId, category, description: body.description?.trim() || null, amount }
    });
    return { data: { success: true } };
  }

  @Delete("expenses/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async deleteExpense(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressExpense.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("expenses/:id/attachments")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.view")
  async listExpenseAttachments(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const expense = await this.prisma.printPressExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!expense) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const items = await this.prisma.printPressExpenseAttachment.findMany({
      where: { tenantId, expenseId: id },
      select: { id: true, createdAt: true, file: { select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      data: {
        items: items.map((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          file: {
            id: a.file.id,
            url: `/api/files/${a.file.id}`,
            originalName: a.file.originalName,
            contentType: a.file.contentType,
            sizeBytes: a.file.sizeBytes,
            createdAt: a.file.createdAt
          }
        }))
      }
    };
  }

  @Post("expenses/:id/attachments")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async addExpenseAttachment(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: { fileId?: string }) {
    const tenantId = req.tenantId;
    const expense = await this.prisma.printPressExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!expense) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const fileId = body.fileId?.trim() || "";
    if (!fileId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const file = await this.prisma.file.findFirst({ where: { tenantId, id: fileId }, select: { id: true } });
    if (!file) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const row = await this.prisma.printPressExpenseAttachment
      .create({
        data: { tenantId, expenseId: id, fileId },
        select: { id: true }
      })
      .catch(async (e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existing = await this.prisma.printPressExpenseAttachment.findFirst({ where: { tenantId, expenseId: id, fileId }, select: { id: true } });
          if (existing) return existing;
        }
        throw e;
      });

    return { data: { id: row.id } };
  }

  @Delete("expenses/:id/attachments/:attachmentId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async deleteExpenseAttachment(@Req() req: { tenantId: string }, @Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressExpenseAttachment.findFirst({ where: { tenantId, id: attachmentId, expenseId: id }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressExpenseAttachment.delete({ where: { id: attachmentId } });
    return { data: { success: true } };
  }

  @Get("recurring-expenses")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.view")
  async listRecurringExpenses(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const items = await this.prisma.printPressRecurringExpense.findMany({
      where: { tenantId, moduleId: "printpress" },
      select: { id: true, isActive: true, nextRunAt: true, interval: true, supplierId: true, category: true, description: true, amount: true, createdAt: true, updatedAt: true, supplier: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      data: {
        items: items.map((r) => ({
          id: r.id,
          isActive: r.isActive,
          nextRunAt: r.nextRunAt,
          interval: r.interval,
          supplierId: r.supplierId,
          supplierName: r.supplier?.name ?? null,
          category: r.category,
          description: r.description,
          amount: r.amount.toString(),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }))
      }
    };
  }

  @Post("recurring-expenses")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async createRecurringExpense(@Req() req: { tenantId: string }, @Body() body: UpsertPrintPressRecurringExpenseDto) {
    const tenantId = req.tenantId;
    const supplierId = body.supplierId?.trim() || null;
    if (supplierId) {
      const supplier = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "printpress" }, select: { id: true } });
      if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const nextRunAt = parseDateTimeOrNow(body.nextRunAt);

    const row = await this.prisma.printPressRecurringExpense.create({
      data: {
        tenantId,
        moduleId: "printpress",
        isActive: body.isActive ? body.isActive === "true" : true,
        nextRunAt,
        interval: body.interval,
        supplierId,
        category,
        description: body.description?.trim() || null,
        amount
      },
      select: { id: true }
    });

    return { data: { id: row.id } };
  }

  @Patch("recurring-expenses/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async updateRecurringExpense(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressRecurringExpenseDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressRecurringExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true, isActive: true, nextRunAt: true, supplierId: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const supplierId = body.supplierId === undefined ? existing.supplierId : body.supplierId?.trim() || null;
    if (supplierId) {
      const supplier = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "printpress" }, select: { id: true } });
      if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const nextRunAt = body.nextRunAt ? parseDateTimeOrNow(body.nextRunAt) : existing.nextRunAt;
    const isActive = body.isActive ? body.isActive === "true" : existing.isActive;

    await this.prisma.printPressRecurringExpense.update({
      where: { id },
      data: {
        isActive,
        nextRunAt,
        interval: body.interval,
        supplierId,
        category,
        description: body.description?.trim() || null,
        amount
      }
    });
    return { data: { success: true } };
  }

  @Delete("recurring-expenses/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async deleteRecurringExpense(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressRecurringExpense.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressRecurringExpense.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Post("recurring-expenses/:id/generate")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async generateRecurringExpense(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;

    const expenseId = await this.prisma.$transaction(async (tx) => {
      const tpl = await tx.printPressRecurringExpense.findFirst({
        where: { tenantId, id, moduleId: "printpress" },
        select: { id: true, isActive: true, nextRunAt: true, interval: true, supplierId: true, category: true, description: true, amount: true }
      });
      if (!tpl) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (!tpl.isActive) throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

      const created = await tx.printPressExpense.create({
        data: {
          tenantId,
          moduleId: "printpress",
          expenseDate: tpl.nextRunAt,
          supplierId: tpl.supplierId,
          category: tpl.category,
          description: tpl.description,
          amount: tpl.amount
        },
        select: { id: true }
      });

      await tx.printPressRecurringExpense.update({
        where: { id: tpl.id },
        data: { nextRunAt: addPrintPressInterval(tpl.nextRunAt, tpl.interval) }
      });

      return created.id;
    });

    return { data: { id: expenseId } };
  }

  @Get("suppliers")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.view")
  async listSuppliers(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const items = await this.prisma.printPressSupplier.findMany({
      where: { tenantId, moduleId: "printpress" },
      select: { id: true, name: true, phone: true, email: true, address: true, createdAt: true, updatedAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    return { data: { items } };
  }

  @Post("suppliers")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async createSupplier(@Req() req: { tenantId: string }, @Body() body: UpsertPrintPressSupplierDto) {
    const tenantId = req.tenantId;
    const name = body.name?.trim();
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    const created = await this.prisma.printPressSupplier.create({
      data: { tenantId, moduleId: "printpress", name, phone: body.phone?.trim() || null, email: body.email?.trim() || null, address: body.address?.trim() || null },
      select: { id: true }
    });
    return { data: { id: created.id } };
  }

  @Patch("suppliers/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async updateSupplier(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressSupplierDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const name = body.name?.trim();
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

    await this.prisma.printPressSupplier.update({
      where: { id },
      data: { name, phone: body.phone?.trim() || null, email: body.email?.trim() || null, address: body.address?.trim() || null }
    });
    return { data: { success: true } };
  }

  @Delete("suppliers/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.expenses.manage")
  async deleteSupplier(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressSupplier.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressSupplier.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("income")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.income.view")
  async listIncome(@Req() req: { tenantId: string }, @Query() query: ListPrintPressIncomeQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const from = parseDateOnlyOrNull(query.from);
    const toExclusive = parseDateOnlyExclusiveOrNull(query.to);

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "printpress" };
    if (from || toExclusive) {
      where.incomeDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };
    }
    if (q) {
      where.OR = [{ category: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
    }

    const [total, items] = await Promise.all([
      this.prisma.printPressIncome.count({ where }),
      this.prisma.printPressIncome.findMany({
        where,
        select: { id: true, incomeDate: true, category: true, description: true, amount: true, createdAt: true, updatedAt: true },
        orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((i) => ({
          id: i.id,
          incomeDate: i.incomeDate,
          category: i.category,
          description: i.description,
          amount: i.amount.toString(),
          createdAt: i.createdAt,
          updatedAt: i.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("income")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.income.manage")
  async createIncome(@Req() req: { tenantId: string }, @Body() body: UpsertPrintPressIncomeDto) {
    const tenantId = req.tenantId;
    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const incomeDate = parseDateTimeOrNow(body.incomeDate);

    const row = await this.prisma.printPressIncome.create({
      data: {
        tenantId,
        moduleId: "printpress",
        incomeDate,
        category,
        description: body.description?.trim() || null,
        amount
      },
      select: { id: true }
    });

    return { data: { id: row.id } };
  }

  @Patch("income/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.income.manage")
  async updateIncome(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpsertPrintPressIncomeDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressIncome.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const category = body.category?.trim();
    if (!category) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const amount = parseDecimalOrZero(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const incomeDate = parseDateTimeOrNow(body.incomeDate);

    await this.prisma.printPressIncome.update({
      where: { id },
      data: { incomeDate, category, description: body.description?.trim() || null, amount }
    });

    return { data: { success: true } };
  }

  @Delete("income/:id")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.income.manage")
  async deleteIncome(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.printPressIncome.findFirst({ where: { tenantId, id, moduleId: "printpress" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.printPressIncome.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("reports/summary")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.reports.view")
  async getReportsSummary(@Req() req: { tenantId: string }, @Query() query: { from?: string; to?: string }) {
    const tenantId = req.tenantId;
    const from = parseDateOnlyOrNull(query.from);
    const toExclusive = parseDateOnlyExclusiveOrNull(query.to);

    const invoiceWhere: Record<string, unknown> = { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] } };
    if (from || toExclusive) invoiceWhere.createdAt = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const expenseWhere: Record<string, unknown> = { tenantId, moduleId: "printpress" };
    if (from || toExclusive) expenseWhere.expenseDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const incomeWhere: Record<string, unknown> = { tenantId, moduleId: "printpress" };
    if (from || toExclusive) incomeWhere.incomeDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const [invoiceAgg, invoiceCount, expenseAgg, incomeAgg] = await Promise.all([
      this.prisma.printPressInvoice.aggregate({ where: invoiceWhere, _sum: { total: true } }),
      this.prisma.printPressInvoice.count({ where: invoiceWhere }),
      this.prisma.printPressExpense.aggregate({ where: expenseWhere, _sum: { amount: true } }),
      this.prisma.printPressIncome.aggregate({ where: incomeWhere, _sum: { amount: true } })
    ]);

    const revenue = invoiceAgg._sum.total ?? new Prisma.Decimal(0);
    const expenses = expenseAgg._sum.amount ?? new Prisma.Decimal(0);
    const otherIncome = incomeAgg._sum.amount ?? new Prisma.Decimal(0);
    const profit = revenue.add(otherIncome).sub(expenses);

    const pending = await this.prisma.printPressInvoice.findMany({
      where: { tenantId, moduleId: "printpress", status: { not: "void" }, ...(from || toExclusive ? { createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}) },
      select: { total: true, paidTotal: true }
    });
    const pendingAmount = pending.reduce((acc, inv) => {
      const due = inv.total.sub(inv.paidTotal);
      return due.gt(0) ? acc.add(due) : acc;
    }, new Prisma.Decimal(0));
    const pendingCount = pending.reduce((acc, inv) => (inv.total.sub(inv.paidTotal).gt(0) ? acc + 1 : acc), 0);

    return {
      data: {
        revenue: revenue.toString(),
        otherIncome: otherIncome.toString(),
        expenses: expenses.toString(),
        profit: profit.toString(),
        invoicesCount: invoiceCount,
        pendingInvoicesCount: pendingCount,
        pendingAmount: pendingAmount.toString()
      }
    };
  }

  @Get("reports/monthly")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.reports.view")
  async getMonthlyReports(@Req() req: { tenantId: string }, @Query() query: { year?: string }) {
    const tenantId = req.tenantId;
    const rawYear = Number((query.year ?? "").trim());
    const year = Number.isFinite(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? Math.trunc(rawYear) : new Date().getFullYear();

    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));

    const [invoices, expenses, incomes] = await Promise.all([
      this.prisma.printPressInvoice.findMany({
        where: { tenantId, moduleId: "printpress", status: { in: ["issued", "paid"] }, createdAt: { gte: start, lt: endExclusive } },
        select: { createdAt: true, total: true }
      }),
      this.prisma.printPressExpense.findMany({
        where: { tenantId, moduleId: "printpress", expenseDate: { gte: start, lt: endExclusive } },
        select: { expenseDate: true, amount: true }
      }),
      this.prisma.printPressIncome.findMany({
        where: { tenantId, moduleId: "printpress", incomeDate: { gte: start, lt: endExclusive } },
        select: { incomeDate: true, amount: true }
      })
    ]);

    const revenueByMonth = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    const expenseByMonth = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    const incomeByMonth = Array.from({ length: 12 }, () => new Prisma.Decimal(0));

    for (const inv of invoices) {
      const m = inv.createdAt.getUTCMonth();
      revenueByMonth[m] = revenueByMonth[m]!.add(inv.total);
    }
    for (const e of expenses) {
      const m = e.expenseDate.getUTCMonth();
      expenseByMonth[m] = expenseByMonth[m]!.add(e.amount);
    }
    for (const inc of incomes) {
      const m = inc.incomeDate.getUTCMonth();
      incomeByMonth[m] = incomeByMonth[m]!.add(inc.amount);
    }

    const items = Array.from({ length: 12 }, (_, idx) => {
      const month = String(idx + 1).padStart(2, "0");
      const revenue = revenueByMonth[idx]!;
      const expensesSum = expenseByMonth[idx]!;
      const income = incomeByMonth[idx]!;
      const profit = revenue.add(income).sub(expensesSum);
      return {
        month: `${year}-${month}`,
        revenue: revenue.toString(),
        otherIncome: income.toString(),
        expenses: expensesSum.toString(),
        profit: profit.toString()
      };
    });

    const totalRevenue = revenueByMonth.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0));
    const totalExpenses = expenseByMonth.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0));
    const totalOtherIncome = incomeByMonth.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0));
    const totalProfit = totalRevenue.add(totalOtherIncome).sub(totalExpenses);

    return { data: { year, items, totals: { revenue: totalRevenue.toString(), otherIncome: totalOtherIncome.toString(), expenses: totalExpenses.toString(), profit: totalProfit.toString() } } };
  }

  @Get("reports/export")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.reports.export")
  async exportReports(@Req() req: { tenantId: string }, @Query() query: { from?: string; to?: string }, @Res({ passthrough: true }) res: Response) {
    const tenantId = req.tenantId;
    const from = parseDateOnlyOrNull(query.from);
    const toExclusive = parseDateOnlyExclusiveOrNull(query.to);

    const invoiceWhere: Record<string, unknown> = { tenantId, moduleId: "printpress", status: { in: ["issued", "paid", "draft", "void"] } };
    if (from || toExclusive) invoiceWhere.createdAt = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const expenseWhere: Record<string, unknown> = { tenantId, moduleId: "printpress" };
    if (from || toExclusive) expenseWhere.expenseDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const incomeWhere: Record<string, unknown> = { tenantId, moduleId: "printpress" };
    if (from || toExclusive) incomeWhere.incomeDate = { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };

    const [invoices, expenses, incomes] = await Promise.all([
      this.prisma.printPressInvoice.findMany({
        where: invoiceWhere,
        select: { invoiceNumber: true, status: true, currencyCode: true, total: true, paidTotal: true, createdAt: true, issuedAt: true }
      }),
      this.prisma.printPressExpense.findMany({
        where: expenseWhere,
        select: { expenseDate: true, category: true, description: true, amount: true, createdAt: true }
      }),
      this.prisma.printPressIncome.findMany({
        where: incomeWhere,
        select: { incomeDate: true, category: true, description: true, amount: true, createdAt: true }
      })
    ]);

    const rangeLabel = `${query.from ?? ""}_${query.to ?? ""}`.replace(/[^\w-]+/g, "_") || "all";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="printpress-report_${rangeLabel}.csv"`);

    const lines: string[] = [];
    lines.push("SECTION,Invoices");
    lines.push("invoice_number,status,currency,total,paid_total,created_at,issued_at");
    for (const i of invoices) {
      lines.push(
        [
          csvEscape(i.invoiceNumber ?? ""),
          csvEscape(i.status),
          csvEscape(i.currencyCode),
          csvEscape(i.total.toString()),
          csvEscape(i.paidTotal.toString()),
          csvEscape(i.createdAt.toISOString()),
          csvEscape(i.issuedAt ? i.issuedAt.toISOString() : "")
        ].join(",")
      );
    }

    lines.push("");
    lines.push("SECTION,Expenses");
    lines.push("expense_date,category,description,amount,created_at");
    for (const e of expenses) {
      lines.push(
        [
          csvEscape(e.expenseDate.toISOString()),
          csvEscape(e.category),
          csvEscape(e.description ?? ""),
          csvEscape(e.amount.toString()),
          csvEscape(e.createdAt.toISOString())
        ].join(",")
      );
    }

    lines.push("");
    lines.push("SECTION,Income");
    lines.push("income_date,category,description,amount,created_at");
    for (const inc of incomes) {
      lines.push(
        [
          csvEscape(inc.incomeDate.toISOString()),
          csvEscape(inc.category),
          csvEscape(inc.description ?? ""),
          csvEscape(inc.amount.toString()),
          csvEscape(inc.createdAt.toISOString())
        ].join(",")
      );
    }

    return lines.join("\n");
  }
}

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i <= 0) return fallback;
  return i;
}

function parseDecimalOrZero(value: string | undefined): Prisma.Decimal {
  try {
    const v = (value ?? "").trim();
    if (!v) return new Prisma.Decimal(0);
    const normalized = v.replace(/,/g, "");
    return new Prisma.Decimal(normalized);
  } catch {
    return new Prisma.Decimal(0);
  }
}

function parseDateOnlyOrNull(value: string | undefined): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function parseDateOnlyExclusiveOrNull(value: string | undefined): Date | null {
  const dt = parseDateOnlyOrNull(value);
  if (!dt) return null;
  const next = new Date(dt);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function parseDateTimeOrNow(value: string | undefined): Date {
  const v = (value ?? "").trim();
  if (!v) return new Date();
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return new Date();
  return dt;
}

function parseDateTimeOrNull(value: string): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function recalcQuotationTotals(prisma: PrismaService | Prisma.TransactionClient, tenantId: string, quotationId: string): Promise<void> {
  const quotation = await prisma.printPressQuotation.findFirst({
    where: { tenantId, id: quotationId, moduleId: "printpress" },
    select: { id: true, discount: true, tax: true }
  });
  if (!quotation) return;

  const linesAgg = await prisma.printPressQuotationLine.aggregate({ where: { tenantId, quotationId }, _sum: { lineTotal: true } });
  const subtotal = linesAgg._sum.lineTotal ?? new Prisma.Decimal(0);
  const total = subtotal.sub(quotation.discount).add(quotation.tax);

  await prisma.printPressQuotation.update({ where: { id: quotationId }, data: { subtotal, total } });
}

async function recalcInvoiceTotals(prisma: PrismaService | Prisma.TransactionClient, tenantId: string, invoiceId: string): Promise<void> {
  const invoice = await prisma.printPressInvoice.findFirst({
    where: { tenantId, id: invoiceId, moduleId: "printpress" },
    select: { id: true, discount: true, tax: true, paidTotal: true, status: true }
  });
  if (!invoice) return;

  const linesAgg = await prisma.printPressInvoiceLine.aggregate({ where: { tenantId, invoiceId }, _sum: { lineTotal: true } });
  const subtotal = linesAgg._sum.lineTotal ?? new Prisma.Decimal(0);
  const total = subtotal.sub(invoice.discount).add(invoice.tax);

  let status: "issued" | "paid" | undefined;
  if (invoice.status === "issued" || invoice.status === "paid") {
    status = invoice.paidTotal.gte(total) ? "paid" : "issued";
  }

  await prisma.printPressInvoice.update({ where: { id: invoiceId }, data: { subtotal, total, status } });
}

function formatPrintPressJobNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `PPJ-${s}`;
}

function formatPrintPressQuotationNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `PPQ-${s}`;
}

function formatPrintPressInvoiceNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `PPI-${s}`;
}

async function reservePrintPressJobNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const updated = await tx.printPressSettings.upsert({
    where: { tenantId },
    update: { nextJobNumber: { increment: 1 } },
    create: { tenantId, nextJobNumber: 2 },
    select: { nextJobNumber: true }
  });
  return formatPrintPressJobNumber(updated.nextJobNumber - 1);
}

async function reservePrintPressQuotationNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const updated = await tx.printPressSettings.upsert({
    where: { tenantId },
    update: { nextQuotationNumber: { increment: 1 } },
    create: { tenantId, nextQuotationNumber: 2 },
    select: { nextQuotationNumber: true }
  });
  return formatPrintPressQuotationNumber(updated.nextQuotationNumber - 1);
}

async function reservePrintPressInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const updated = await tx.printPressSettings.upsert({
    where: { tenantId },
    update: { nextInvoiceNumber: { increment: 1 } },
    create: { tenantId, nextInvoiceNumber: 2 },
    select: { nextInvoiceNumber: true }
  });
  return formatPrintPressInvoiceNumber(updated.nextInvoiceNumber - 1);
}

async function getPrintPressDefaultCurrencyCode(prisma: PrismaService | Prisma.TransactionClient, tenantId: string): Promise<string> {
  const row = await prisma.printPressSettings.findUnique({ where: { tenantId }, select: { defaultCurrencyCode: true } });
  if (row?.defaultCurrencyCode) return row.defaultCurrencyCode;
  const created = await prisma.printPressSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId }, select: { defaultCurrencyCode: true } });
  return created.defaultCurrencyCode;
}

const STORAGE_ROOT = path.join(process.cwd(), "apps", "api", "storage");

async function loadTenantFileBuffer(prisma: PrismaService, tenantId: string, fileId: string): Promise<Buffer | null> {
  const record = await prisma.file.findUnique({ where: { id: fileId }, select: { id: true, tenantId: true, storageKey: true } });
  if (!record) return null;
  if (record.tenantId !== tenantId) return null;
  try {
    const diskPath = path.join(STORAGE_ROOT, record.storageKey.replaceAll("/", path.sep));
    return await fs.readFile(diskPath);
  } catch {
    return null;
  }
}

function safeFilename(value: string): string {
  const raw = (value ?? "").trim() || "document";
  return raw
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

type PdfLine = { description: string; quantity: string; unitPrice: string; lineTotal: string };
type PdfBranding = { businessName: string | null; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; logoBuffer: Buffer | null };

async function buildPrintPressInvoicePdf(args: {
  title: string;
  invoice: {
    invoiceNumber: string | null;
    status: string;
    currencyCode: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    paidTotal: string;
    notes: string | null;
    issuedAt: Date | null;
    dueAt: Date | null;
    createdAt: Date;
    customerName: string | null;
    lines: PdfLine[];
  };
} & PdfBranding): Promise<Buffer> {
  return await buildPdfBuffer((doc) => {
    renderPrintPressHeader(doc, {
      title: args.title,
      businessName: args.businessName,
      phone: args.phone,
      email: args.email,
      address: args.address,
      taxNumber: args.taxNumber,
      logoBuffer: args.logoBuffer
    });
    let y = 140;

    const metaLeft: Array<[string, string]> = [
      ["Customer", args.invoice.customerName ?? "—"],
      ["Status", args.invoice.status],
      ["Currency", args.invoice.currencyCode]
    ];
    const metaRight: Array<[string, string]> = [["Created", args.invoice.createdAt.toLocaleString()]];
    if (args.invoice.issuedAt) metaRight.push(["Issued", args.invoice.issuedAt.toLocaleString()]);
    if (args.invoice.dueAt) metaRight.push(["Due", args.invoice.dueAt.toLocaleDateString()]);
    y = renderTwoColumnMeta(doc, y, metaLeft, metaRight);

    y += 14;
    y = renderLinesTable(doc, y, args.invoice.lines, args.invoice.currencyCode);

    y += 14;
    const totals: Array<[string, string]> = [
      ["Subtotal", `${args.invoice.subtotal} ${args.invoice.currencyCode}`],
      ["Discount", `${args.invoice.discount} ${args.invoice.currencyCode}`],
      ["Tax", `${args.invoice.tax} ${args.invoice.currencyCode}`],
      ["Total", `${args.invoice.total} ${args.invoice.currencyCode}`],
      ["Paid", `${args.invoice.paidTotal} ${args.invoice.currencyCode}`]
    ];
    y = renderTotals(doc, y, totals);

    if (args.invoice.notes?.trim()) {
      y += 16;
      y = ensurePageSpace(doc, y, 90);
      doc.fontSize(10).fillColor("#111827").text("Notes", 50, y);
      y += 14;
      doc.fontSize(10).fillColor("#374151").text(args.invoice.notes.trim(), 50, y, { width: 495 });
    }
  });
}

async function buildPrintPressReceiptPdf(args: {
  title: string;
  receipt: {
    invoiceNumber: string | null;
    status: string;
    currencyCode: string;
    total: string;
    paidTotal: string;
    notes: string | null;
    createdAt: Date;
    issuedAt: Date | null;
    customerName: string | null;
    payments: Array<{ method: string; amount: string; note: string | null; createdAt: Date }>;
  };
} & PdfBranding): Promise<Buffer> {
  return await buildPdfBuffer((doc) => {
    renderPrintPressHeader(doc, {
      title: args.title,
      businessName: args.businessName,
      phone: args.phone,
      email: args.email,
      address: args.address,
      taxNumber: args.taxNumber,
      logoBuffer: args.logoBuffer
    });

    let y = 140;

    const metaLeft: Array<[string, string]> = [
      ["Customer", args.receipt.customerName ?? "—"],
      ["Invoice #", args.receipt.invoiceNumber ?? "—"],
      ["Status", args.receipt.status],
      ["Currency", args.receipt.currencyCode]
    ];
    const metaRight: Array<[string, string]> = [["Created", args.receipt.createdAt.toLocaleString()]];
    if (args.receipt.issuedAt) metaRight.push(["Issued", args.receipt.issuedAt.toLocaleString()]);
    y = renderTwoColumnMeta(doc, y, metaLeft, metaRight);

    y += 14;
    y = ensurePageSpace(doc, y, 120);

    const total = new Prisma.Decimal(args.receipt.total || "0");
    const paid = new Prisma.Decimal(args.receipt.paidTotal || "0");
    const due = total.sub(paid);

    const totals: Array<[string, string]> = [
      ["Total", `${total.toString()} ${args.receipt.currencyCode}`],
      ["Paid", `${paid.toString()} ${args.receipt.currencyCode}`],
      ["Balance due", `${due.toString()} ${args.receipt.currencyCode}`]
    ];
    y = renderTotals(doc, y, totals);

    y += 18;
    y = ensurePageSpace(doc, y, 140);
    doc.fontSize(11).fillColor("#111827").text("Payments", 50, y);
    y += 14;

    const x = 50;
    const wDate = 140;
    const wMethod = 100;
    const wAmount = 90;
    const wNote = 495 - wDate - wMethod - wAmount;

    doc.fontSize(9).fillColor("#6B7280");
    doc.text("Date", x, y, { width: wDate });
    doc.text("Method", x + wDate, y, { width: wMethod });
    doc.text("Amount", x + wDate + wMethod, y, { width: wAmount, align: "right" });
    doc.text("Note", x + wDate + wMethod + wAmount, y, { width: wNote });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor("#E5E7EB").stroke();
    y += 8;

    const payments = args.receipt.payments ?? [];
    if (payments.length === 0) {
      doc.fontSize(10).fillColor("#374151").text("—", x, y);
      y += 16;
    } else {
      for (const p of payments) {
        y = ensurePageSpace(doc, y, 40);
        const startY = y;
        doc.fontSize(10).fillColor("#111827").text(p.createdAt.toLocaleString(), x, startY, { width: wDate });
        doc.text(p.method, x + wDate, startY, { width: wMethod });
        doc.text(`${p.amount} ${args.receipt.currencyCode}`, x + wDate + wMethod, startY, { width: wAmount, align: "right" });
        doc.fontSize(10).fillColor("#374151").text(p.note?.trim() ? p.note.trim() : "—", x + wDate + wMethod + wAmount, startY, { width: wNote });
        y = Math.max(doc.y, startY + 12) + 8;
        doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor("#F3F4F6").stroke();
        y += 8;
      }
    }

    if (args.receipt.notes?.trim()) {
      y += 10;
      y = ensurePageSpace(doc, y, 90);
      doc.fontSize(10).fillColor("#111827").text("Notes", 50, y);
      y += 14;
      doc.fontSize(10).fillColor("#374151").text(args.receipt.notes.trim(), 50, y, { width: 495 });
    }
  });
}

async function buildPrintPressQuotationPdf(args: {
  title: string;
  quotation: {
    quotationNumber: string | null;
    status: string;
    currencyCode: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    notes: string | null;
    issuedAt: Date | null;
    createdAt: Date;
    customerName: string | null;
    lines: PdfLine[];
  };
} & PdfBranding): Promise<Buffer> {
  return await buildPdfBuffer((doc) => {
    renderPrintPressHeader(doc, {
      title: args.title,
      businessName: args.businessName,
      phone: args.phone,
      email: args.email,
      address: args.address,
      taxNumber: args.taxNumber,
      logoBuffer: args.logoBuffer
    });
    let y = 140;

    const metaLeft: Array<[string, string]> = [
      ["Customer", args.quotation.customerName ?? "—"],
      ["Status", args.quotation.status],
      ["Currency", args.quotation.currencyCode]
    ];
    const metaRight: Array<[string, string]> = [["Created", args.quotation.createdAt.toLocaleString()]];
    if (args.quotation.issuedAt) metaRight.push(["Issued", args.quotation.issuedAt.toLocaleString()]);
    y = renderTwoColumnMeta(doc, y, metaLeft, metaRight);

    y += 14;
    y = renderLinesTable(doc, y, args.quotation.lines, args.quotation.currencyCode);

    y += 14;
    const totals: Array<[string, string]> = [
      ["Subtotal", `${args.quotation.subtotal} ${args.quotation.currencyCode}`],
      ["Discount", `${args.quotation.discount} ${args.quotation.currencyCode}`],
      ["Tax", `${args.quotation.tax} ${args.quotation.currencyCode}`],
      ["Total", `${args.quotation.total} ${args.quotation.currencyCode}`]
    ];
    y = renderTotals(doc, y, totals);

    if (args.quotation.notes?.trim()) {
      y += 16;
      y = ensurePageSpace(doc, y, 90);
      doc.fontSize(10).fillColor("#111827").text("Notes", 50, y);
      y += 14;
      doc.fontSize(10).fillColor("#374151").text(args.quotation.notes.trim(), 50, y, { width: 495 });
    }
  });
}

function buildPdfBuffer(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));
    try {
      draw(doc as unknown as PDFKit.PDFDocument);
      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}

function renderPrintPressHeader(
  doc: PDFKit.PDFDocument,
  args: { title: string; businessName: string | null; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; logoBuffer: Buffer | null }
) {
  if (args.logoBuffer) {
    try {
      doc.image(args.logoBuffer, 50, 45, { fit: [90, 50] });
    } catch (e) {
      void e;
    }
  }

  const rightX = 160;
  doc.fontSize(16).fillColor("#111827").text(args.businessName ?? "—", rightX, 45, { width: 385 });
  doc.fontSize(10).fillColor("#374151").text([args.phone, args.email].filter(Boolean).join(" • "), rightX, 65, { width: 385 });
  if (args.address) doc.fontSize(10).fillColor("#374151").text(args.address, rightX, 80, { width: 385 });
  if (args.taxNumber) doc.fontSize(10).fillColor("#374151").text(`Tax: ${args.taxNumber}`, rightX, 95, { width: 385 });

  doc.fontSize(22).fillColor("#111827").text(args.title, 50, 45, { width: 495, align: "right" });
  doc.moveTo(50, 120).lineTo(545, 120).lineWidth(1).strokeColor("#E5E7EB").stroke();
}

function renderTwoColumnMeta(doc: PDFKit.PDFDocument, y: number, left: Array<[string, string]>, right: Array<[string, string]>): number {
  y = ensurePageSpace(doc, y, 80);
  const leftX = 50;
  const rightX = 320;
  const rowH = 14;
  const maxRows = Math.max(left.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const l = left[i];
    const r = right[i];
    if (l) {
      doc.fontSize(9).fillColor("#6B7280").text(l[0], leftX, y);
      doc.fontSize(10).fillColor("#111827").text(l[1], leftX + 70, y, { width: 220 });
    }
    if (r) {
      doc.fontSize(9).fillColor("#6B7280").text(r[0], rightX, y);
      doc.fontSize(10).fillColor("#111827").text(r[1], rightX + 70, y, { width: 155 });
    }
    y += rowH;
  }
  return y;
}

function renderLinesTable(doc: PDFKit.PDFDocument, y: number, lines: PdfLine[], currencyCode: string): number {
  y = ensurePageSpace(doc, y, 120);
  const x = 50;
  const wDesc = 280;
  const wQty = 55;
  const wUnit = 75;
  const wTotal = 85;

  doc.fontSize(9).fillColor("#6B7280");
  doc.text("Description", x, y, { width: wDesc });
  doc.text("Qty", x + wDesc, y, { width: wQty, align: "right" });
  doc.text("Unit", x + wDesc + wQty, y, { width: wUnit, align: "right" });
  doc.text("Total", x + wDesc + wQty + wUnit, y, { width: wTotal, align: "right" });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor("#E5E7EB").stroke();
  y += 8;

  for (const l of lines) {
    y = ensurePageSpace(doc, y, 60);
    const startY = y;
    doc.fontSize(10).fillColor("#111827").text(l.description, x, y, { width: wDesc });
    const afterDescY = doc.y;
    doc.fontSize(10).fillColor("#111827").text(l.quantity, x + wDesc, startY, { width: wQty, align: "right" });
    doc.text(`${l.unitPrice} ${currencyCode}`, x + wDesc + wQty, startY, { width: wUnit, align: "right" });
    doc.text(`${l.lineTotal} ${currencyCode}`, x + wDesc + wQty + wUnit, startY, { width: wTotal, align: "right" });
    y = Math.max(afterDescY, startY + 12) + 8;
    doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor("#F3F4F6").stroke();
    y += 8;
  }

  if (!lines.length) {
    doc.fontSize(10).fillColor("#6B7280").text("No items", x, y, { width: 495, align: "center" });
    y += 24;
  }
  return y;
}

function renderTotals(doc: PDFKit.PDFDocument, y: number, rows: Array<[string, string]>): number {
  y = ensurePageSpace(doc, y, 120);
  const labelX = 320;
  const valueX = 545;
  for (const [label, value] of rows) {
    doc.fontSize(10).fillColor("#6B7280").text(label, labelX, y, { width: 180, align: "right" });
    doc.fontSize(10).fillColor("#111827").text(value, 50, y, { width: valueX - 50, align: "right" });
    y += 14;
  }
  return y;
}

function ensurePageSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  const bottom = doc.page.height - 50;
  if (y + needed <= bottom) return y;
  doc.addPage();
  return 50;
}

function addPrintPressInterval(date: Date, interval: "weekly" | "monthly" | "yearly"): Date {
  const d = new Date(date);
  if (interval === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  if (interval === "monthly") {
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}
