const engineTypeRaw = (process.env.PRISMA_CLIENT_ENGINE_TYPE ?? "").toLowerCase();
const rawDbUrl = process.env.DATABASE_URL ?? "";

if (rawDbUrl.startsWith("prisma+postgresql://")) {
  process.env.DATABASE_URL = rawDbUrl.replace("prisma+postgresql://", "postgresql://");
}

const dbUrl = process.env.DATABASE_URL ?? "";
const isAccelerateUrl = dbUrl.startsWith("prisma://") || dbUrl.startsWith("prisma+postgres://");

if (!isAccelerateUrl && (engineTypeRaw === "data-proxy" || engineTypeRaw === "dataproxy" || engineTypeRaw === "accelerate" || engineTypeRaw === "client")) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}
