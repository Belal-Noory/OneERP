import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

function loadEnvFromFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseEnvFile(content);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    return;
  }
}

function loadSeedEnv() {
  const prismaDir = __dirname;
  const apiDir = path.resolve(prismaDir, "..");
  const repoRoot = path.resolve(apiDir, "..", "..");

  loadEnvFromFile(path.join(repoRoot, ".env"));
  loadEnvFromFile(path.join(repoRoot, ".env.local"));
  loadEnvFromFile(path.join(apiDir, ".env"));
  loadEnvFromFile(path.join(apiDir, ".env.local"));
  loadEnvFromFile(path.join(prismaDir, ".env"));
}

async function main() {
  loadSeedEnv();
  await seedPlans();
  await seedModules();
  await seedPermissions();
  await seedOwnerAdmin();
}

async function seedPlans() {
  await prisma.planCatalog.upsert({
    where: { code: "basic" },
    update: { isActive: true, nameKey: "public.pricing.plan.basic.name", descriptionKey: "public.pricing.plan.basic.desc" },
    create: { code: "basic", isActive: true, nameKey: "public.pricing.plan.basic.name", descriptionKey: "public.pricing.plan.basic.desc" }
  });
  await prisma.planCatalog.upsert({
    where: { code: "pro" },
    update: { isActive: true, nameKey: "public.pricing.plan.pro.name", descriptionKey: "public.pricing.plan.pro.desc" },
    create: { code: "pro", isActive: true, nameKey: "public.pricing.plan.pro.name", descriptionKey: "public.pricing.plan.pro.desc" }
  });
  await prisma.planCatalog.upsert({
    where: { code: "enterprise" },
    update: { isActive: true, nameKey: "public.pricing.plan.enterprise.name", descriptionKey: "public.pricing.plan.enterprise.desc" },
    create: {
      code: "enterprise",
      isActive: true,
      nameKey: "public.pricing.plan.enterprise.name",
      descriptionKey: "public.pricing.plan.enterprise.desc"
    }
  });
}

async function seedModules() {
  const base = (id: string) => ({
    id,
    version: "1.0.0",
    category: "operations",
    icon: id,
    manifestJson: {}
  });

  await prisma.moduleCatalog.upsert({
    where: { id: "shop" },
    update: { ...base("shop"), isActive: true, nameKey: "module.shop.name", descriptionKey: "module.shop.description" },
    create: { ...base("shop"), isActive: true, nameKey: "module.shop.name", descriptionKey: "module.shop.description" }
  });

  await prisma.moduleCatalog.upsert({
    where: { id: "pharmacy" },
    update: { ...base("pharmacy"), isActive: true, nameKey: "module.pharmacy.name", descriptionKey: "module.pharmacy.description" },
    create: { ...base("pharmacy"), isActive: true, nameKey: "module.pharmacy.name", descriptionKey: "module.pharmacy.description" }
  });

  await prisma.moduleCatalog.upsert({
    where: { id: "fuel" },
    update: { ...base("fuel"), isActive: true, nameKey: "module.fuel.name", descriptionKey: "module.fuel.description" },
    create: { ...base("fuel"), isActive: true, nameKey: "module.fuel.name", descriptionKey: "module.fuel.description" }
  });
}

async function seedPermissions() {
  const permissions: { key: string; labelKey: string; descriptionKey: string }[] = [
    "platform.tenant.read",
    "platform.tenant.update",
    "platform.tenant.branding.read",
    "platform.tenant.branding.update",
    "platform.tenant.language.read",
    "platform.tenant.language.update",
    "platform.users.read",
    "platform.users.invite",
    "platform.users.update",
    "platform.users.deactivate",
    "platform.memberships.read",
    "platform.memberships.update",
    "platform.memberships.remove",
    "platform.roles.read",
    "platform.roles.create",
    "platform.roles.update",
    "platform.roles.delete",
    "platform.permissions.read",
    "platform.modules.catalog.read",
    "platform.modules.enabled.read",
    "platform.modules.enable",
    "platform.modules.disable",
    "platform.subscription.read",
    "platform.subscription.update",
    "platform.billing.portal.access",
    "platform.audit.read",
    "platform.audit.export",
    "platform.reports.export",
    "shop.overview.read",
    "shop.products.read",
    "shop.products.create",
    "shop.products.update",
    "shop.products.delete",
    "shop.customers.read",
    "shop.customers.create",
    "shop.customers.update",
    "shop.customers.delete",
    "shop.orders.read",
    "shop.orders.create",
    "shop.orders.update",
    "shop.orders.cancel",
    "shop.orders.delete",
    "shop.payments.read",
    "shop.payments.create",
    "shop.payments.refund",
    "shop.inventory.read",
    "shop.inventory.adjust",
    "shop.inventory.transfer",
    "shop.locations.read",
    "shop.locations.create",
    "shop.locations.update",
    "shop.customers.read",
    "shop.customers.create",
    "shop.customers.update",
    "shop.customers.delete",
    "shop.invoices.read",
    "shop.invoices.create",
    "shop.invoices.update",
    "shop.invoices.post",
    "shop.invoices.delete",
    "shop.invoices.void",
    "shop.audit.read",
    "shop.reports.read",
    "shop.reports.export",
    "shop.cash.read",
    "shop.cash.open",
    "shop.cash.close",
    "shop.cash.adjust",
    "shop.suppliers.read",
    "shop.suppliers.create",
    "shop.suppliers.update",
    "shop.suppliers.delete",
    "shop.purchases.read",
    "shop.purchases.create",
    "shop.purchases.update",
    "shop.purchases.post",
    "shop.purchases.refund",
    "shop.purchases.pay",
    "shop.purchases.void",
    "fuel.tanks.view",
    "fuel.tanks.manage",
    "fuel.pumps.view",
    "fuel.pumps.manage",
    "fuel.shifts.view",
    "fuel.shifts.manage",
    "fuel.sales.view",
    "fuel.sales.create",
    "fuel.reports.view"
  ].map((key) => ({
    key,
    labelKey: `permission.${key}`,
    descriptionKey: `permission.${key}.desc`
  }));

  for (const p of permissions) {
    await prisma.permissionCatalog.upsert({
      where: { key: p.key },
      update: { labelKey: p.labelKey, descriptionKey: p.descriptionKey },
      create: p
    });
  }
}

async function seedOwnerAdmin() {
  const email = (process.env.OWNER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.OWNER_ADMIN_PASSWORD ?? "";
  const fullName = (process.env.OWNER_ADMIN_NAME ?? "Owner Admin").trim() || "Owner Admin";
  if (!email || !password) return;

  const passwordHash = await argon2.hash(password);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    const upsert = (process.env.OWNER_ADMIN_UPSERT ?? "").trim() === "1";
    if (!upsert) return;
    await prisma.user.update({ where: { email }, data: { fullName, passwordHash, isActive: true } });
    return;
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      isActive: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    await prisma.$disconnect();
    throw e;
  });
