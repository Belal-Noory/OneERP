import crypto from "crypto";
import path from "path";

async function main() {
  process.env.ONEERP_DESKTOP_DB_PATH =
    process.env.ONEERP_DESKTOP_DB_PATH || path.join(process.cwd(), "tools", "tmp", `oneerp-e2e-${crypto.randomUUID()}.sqlite`);

  const mod = await import("../apps/desktop/src/main/db");

  const tenantId = "e2e-tenant";
  const moduleId = "shop";
  const outboxId = crypto.randomUUID();

  mod.getDb();
  mod.addOutboxEvent({
    id: outboxId,
    tenantId,
    moduleId,
    entityType: "shop_product",
    entityLocalId: "e2e-entity",
    operation: "create",
    payloadJson: JSON.stringify({ id: "e2e-entity", name: "X", sellPrice: "1.00" }),
    createdAt: new Date().toISOString()
  });

  mod.markOutboxEventsProcessed([{ id: outboxId, ok: false, errorKey: "errors.validationError", errorDetail: "simulated" }]);
  const err1 = mod.countOutboxEventErrors(tenantId, moduleId);
  if (err1 !== 1) throw new Error(`Expected 1 error, got ${err1}`);

  const list1 = mod.listOutboxEventErrors(tenantId, moduleId, 10);
  if (!list1.length || list1[0].errorKey !== "errors.validationError") throw new Error("Expected error list entry");

  mod.requeueOutboxEventErrors(tenantId, moduleId);
  const err2 = mod.countOutboxEventErrors(tenantId, moduleId);
  if (err2 !== 0) throw new Error(`Expected 0 errors after requeue, got ${err2}`);

  const pending = mod.listPendingOutboxEventsForModule(tenantId, moduleId, 10);
  if (!pending.some((e: { id: string }) => e.id === outboxId)) throw new Error("Expected requeued event to be pending again");

  mod.markOutboxEventsProcessed([{ id: outboxId, ok: false, errorKey: "errors.validationError", errorDetail: "simulated2" }]);
  mod.clearOutboxEventErrors(tenantId, moduleId);
  const err3 = mod.countOutboxEventErrors(tenantId, moduleId);
  if (err3 !== 0) throw new Error(`Expected 0 errors after clear, got ${err3}`);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        dbPath: process.env.ONEERP_DESKTOP_DB_PATH,
        outboxId
      },
      null,
      2
    ) + "\n"
  );
}

void main();
