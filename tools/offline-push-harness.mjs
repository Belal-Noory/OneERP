import crypto from "crypto";
import fs from "fs";
import path from "path";

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson(p) {
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s);
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
}

function normalizeInput(json) {
  if (Array.isArray(json)) return { items: json };
  if (json && typeof json === "object" && Array.isArray(json.items)) return { items: json.items };
  if (json && typeof json === "object" && Array.isArray(json.events)) return { items: json.events };
  die("Invalid input JSON. Expected an array, or { items: [...] }, or { events: [...] }.");
}

function toEventAndExpect(x) {
  if (x && typeof x === "object" && "event" in x) {
    const event = x.event;
    const expect = x.expect ?? null;
    return { event, expect };
  }
  return { event: x, expect: null };
}

function buildEvent(raw, tenantId) {
  const e = raw && typeof raw === "object" ? raw : null;
  if (!e) die("Invalid event entry: expected object.");
  const id = typeof e.id === "string" ? e.id : "";
  const moduleId = typeof e.moduleId === "string" ? e.moduleId : "";
  const entityType = typeof e.entityType === "string" ? e.entityType : "";
  const entityLocalId = typeof e.entityLocalId === "string" ? e.entityLocalId : "";
  const operation = typeof e.operation === "string" ? e.operation : "";
  const createdAt = typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString();
  if (!id || !moduleId || !entityType || !entityLocalId || !operation) die(`Missing required event fields for id=${id || "(missing id)"}`);

  let payloadJson = typeof e.payloadJson === "string" ? e.payloadJson : null;
  if (!payloadJson && "payload" in e) payloadJson = JSON.stringify(e.payload ?? null);
  if (payloadJson === null) payloadJson = JSON.stringify(null);

  return { id, tenantId, moduleId, entityType, entityLocalId, operation, payloadJson, createdAt };
}

function pickExpected(expect) {
  if (!expect || typeof expect !== "object") return null;
  const ok = "ok" in expect ? Boolean(expect.ok) : null;
  const errorKey = typeof expect.errorKey === "string" ? expect.errorKey : null;
  return { ok, errorKey };
}

function assertResults(data, expectations) {
  const processedIds = Array.isArray(data?.processedIds) ? data.processedIds : [];
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!processedIds.length) die("No processedIds returned. Check that your events match supported types and tenantId.");
  if (results.length < processedIds.length) die(`results.length (${results.length}) < processedIds.length (${processedIds.length}).`);

  const byId = new Map();
  for (const r of results) {
    const eventId = typeof r?.eventId === "string" ? r.eventId : "";
    if (!eventId) continue;
    if (!byId.has(eventId)) byId.set(eventId, []);
    byId.get(eventId).push(r);
  }

  for (const id of processedIds) {
    const rows = byId.get(id) ?? [];
    if (rows.length !== 1) die(`Expected exactly 1 result row for eventId=${id}, got ${rows.length}.`);
    const row = rows[0];
    const ok = Boolean(row.ok ?? false);
    const errorKey = typeof row.errorKey === "string" ? row.errorKey : null;
    const exp = expectations.get(id) ?? null;
    if (exp) {
      if (exp.ok !== null && ok !== exp.ok) die(`Expectation failed for ${id}: expected ok=${exp.ok}, got ok=${ok}`);
      if (exp.errorKey !== null && errorKey !== exp.errorKey) die(`Expectation failed for ${id}: expected errorKey=${exp.errorKey}, got ${errorKey}`);
    }
  }
}

async function apiRequest(baseUrl, token, tenantId, input, init) {
  const res = await fetch(`${baseUrl}${input}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "x-tenant-id": tenantId,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) die(`HTTP ${res.status} ${input}\n${JSON.stringify(json, null, 2)}`);
  return json;
}

async function pushEvents(baseUrl, token, tenantId, events, expectations) {
  const json = await apiRequest(baseUrl, token, tenantId, "/api/offline/push", { method: "POST", body: { events } });
  assertResults(json?.data, expectations ?? new Map());
  return json;
}

async function pullModule(baseUrl, token, tenantId, moduleId) {
  return apiRequest(baseUrl, token, tenantId, "/api/offline/pull", { method: "POST", body: { moduleId, cursor: null } });
}

function getArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return idx + 1 < args.length ? args[idx + 1] : null;
}

function hasArg(args, name) {
  return args.includes(name);
}

function ensureFixtures(fixturesPath, tenantId) {
  if (fs.existsSync(fixturesPath)) {
    const raw = readJson(fixturesPath);
    if (raw && typeof raw === "object" && raw.shop && raw.pharmacy) {
      const wrapped = { tenants: { legacy: raw } };
      writeJson(fixturesPath, wrapped);
      return ensureFixtures(fixturesPath, tenantId);
    }
    if (raw && typeof raw === "object" && raw.tenants && typeof raw.tenants === "object") {
      const existing = raw.tenants[tenantId] ?? null;
      if (existing) {
        let changed = false;
        if (existing.pharmacy && typeof existing.pharmacy === "object") {
          if (!existing.pharmacy.invoiceId) {
            existing.pharmacy.invoiceId = crypto.randomUUID();
            changed = true;
          }
          if (!existing.pharmacy.invoiceLineId) {
            existing.pharmacy.invoiceLineId = crypto.randomUUID();
            changed = true;
          }
          if (!existing.pharmacy.eventIds || typeof existing.pharmacy.eventIds !== "object") {
            existing.pharmacy.eventIds = {};
            changed = true;
          }
          for (const k of ["invCreate", "invUpdate", "invPost"]) {
            if (!existing.pharmacy.eventIds[k]) {
              existing.pharmacy.eventIds[k] = crypto.randomUUID();
              changed = true;
            }
          }
          if (!existing.pharmacy.refundInvoiceId) {
            existing.pharmacy.refundInvoiceId = crypto.randomUUID();
            changed = true;
          }
          for (const k of ["refundDraft", "refundPost", "refundVoid"]) {
            if (!existing.pharmacy.eventIds[k]) {
              existing.pharmacy.eventIds[k] = crypto.randomUUID();
              changed = true;
            }
          }
          if (!existing.pharmacy.purchaseRefundInvoiceId) {
            existing.pharmacy.purchaseRefundInvoiceId = crypto.randomUUID();
            changed = true;
          }
          if (!existing.pharmacy.purchaseRefundLineId) {
            existing.pharmacy.purchaseRefundLineId = crypto.randomUUID();
            changed = true;
          }
          for (const k of ["pinvRefundDraft", "pinvRefundUpdate", "pinvRefundPost"]) {
            if (!existing.pharmacy.eventIds[k]) {
              existing.pharmacy.eventIds[k] = crypto.randomUUID();
              changed = true;
            }
          }
          if (!existing.pharmacy.eventIds.pinvRefundVoid) {
            existing.pharmacy.eventIds.pinvRefundVoid = crypto.randomUUID();
            changed = true;
          }
        }
        if (changed) {
          raw.tenants[tenantId] = existing;
          writeJson(fixturesPath, raw);
        }
        return existing;
      }
    }
  }
  const shop = {
    unitId: crypto.randomUUID(),
    locationAId: crypto.randomUUID(),
    locationBId: crypto.randomUUID(),
    categoryId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    supplierId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    purchaseInvoiceId: crypto.randomUUID(),
    eventIds: {
      unitCreate: crypto.randomUUID(),
      locACreate: crypto.randomUUID(),
      locBCreate: crypto.randomUUID(),
      catCreate: crypto.randomUUID(),
      customerCreate: crypto.randomUUID(),
      supplierCreate: crypto.randomUUID(),
      productCreate: crypto.randomUUID(),
      stockReceive: crypto.randomUUID(),
      stockTransfer: crypto.randomUUID(),
      invCreate: crypto.randomUUID(),
      invUpdate: crypto.randomUUID(),
      invPost: crypto.randomUUID(),
      pinvCreate: crypto.randomUUID(),
      pinvUpdate: crypto.randomUUID(),
      pinvReceive: crypto.randomUUID(),
      pinvPost: crypto.randomUUID(),
      pinvPay: crypto.randomUUID()
    }
  };
  const pharmacy = {
    unitId: crypto.randomUUID(),
    locationAId: crypto.randomUUID(),
    locationBId: crypto.randomUUID(),
    categoryId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    supplierId: crypto.randomUUID(),
    purchaseInvoiceId: crypto.randomUUID(),
    purchaseInvoiceLineId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    invoiceLineId: crypto.randomUUID(),
    refundInvoiceId: crypto.randomUUID(),
    purchaseRefundInvoiceId: crypto.randomUUID(),
    purchaseRefundLineId: crypto.randomUUID(),
    eventIds: {
      unitCreate: crypto.randomUUID(),
      locACreate: crypto.randomUUID(),
      locBCreate: crypto.randomUUID(),
      catCreate: crypto.randomUUID(),
      productCreate: crypto.randomUUID(),
      stockReceive: crypto.randomUUID(),
      stockTransfer: crypto.randomUUID(),
      supplierCreate: crypto.randomUUID(),
      pinvCreate: crypto.randomUUID(),
      pinvUpdate: crypto.randomUUID(),
      pinvReceive: crypto.randomUUID(),
      pinvPost: crypto.randomUUID(),
      invCreate: crypto.randomUUID(),
      invUpdate: crypto.randomUUID(),
      invPost: crypto.randomUUID(),
      refundDraft: crypto.randomUUID(),
      refundPost: crypto.randomUUID(),
      refundVoid: crypto.randomUUID(),
      pinvRefundDraft: crypto.randomUUID(),
      pinvRefundUpdate: crypto.randomUUID(),
      pinvRefundPost: crypto.randomUUID(),
      pinvRefundVoid: crypto.randomUUID()
    }
  };
  const fixtures = { shop, pharmacy };
  const container = fs.existsSync(fixturesPath) ? readJson(fixturesPath) : { tenants: {} };
  const next = container && typeof container === "object" && container.tenants && typeof container.tenants === "object" ? container : { tenants: {} };
  next.tenants[tenantId] = fixtures;
  writeJson(fixturesPath, next);
  return fixtures;
}

function shopScenarioEvents(fixtures, tenantId) {
  const f = fixtures.shop;
  const now = new Date().toISOString();
  const events = [
    { id: f.eventIds.unitCreate, moduleId: "shop", entityType: "shop_unit", entityLocalId: f.unitId, operation: "create", createdAt: now, payload: { id: f.unitId, name: "Piece", symbol: "pc" } },
    { id: f.eventIds.locACreate, moduleId: "shop", entityType: "shop_location", entityLocalId: f.locationAId, operation: "create", createdAt: now, payload: { id: f.locationAId, name: "Main" } },
    { id: f.eventIds.locBCreate, moduleId: "shop", entityType: "shop_location", entityLocalId: f.locationBId, operation: "create", createdAt: now, payload: { id: f.locationBId, name: "Second" } },
    { id: f.eventIds.catCreate, moduleId: "shop", entityType: "shop_category", entityLocalId: f.categoryId, operation: "create", createdAt: now, payload: { id: f.categoryId, name: "General", parentId: null } },
    { id: f.eventIds.customerCreate, moduleId: "shop", entityType: "shop_customer", entityLocalId: f.customerId, operation: "create", createdAt: now, payload: { id: f.customerId, name: "Offline Customer", phone: null, email: null, address: null, notes: null } },
    { id: f.eventIds.supplierCreate, moduleId: "shop", entityType: "shop_supplier", entityLocalId: f.supplierId, operation: "create", createdAt: now, payload: { id: f.supplierId, name: "Offline Supplier", phone: null, email: null, address: null, notes: null } },
    {
      id: f.eventIds.productCreate,
      moduleId: "shop",
      entityType: "shop_product",
      entityLocalId: f.productId,
      operation: "create",
      createdAt: now,
      payload: { id: f.productId, name: "Test Product", sku: "OFF-001", sellPrice: "100.00", unitId: f.unitId, categoryId: f.categoryId, costPrice: "60.00", barcodes: [] }
    },
    {
      id: f.eventIds.stockReceive,
      moduleId: "shop",
      entityType: "shop_stock_movement",
      entityLocalId: f.eventIds.stockReceive,
      operation: "create",
      createdAt: now,
      payload: { type: "receive", productId: f.productId, locationId: f.locationAId, qty: "10", note: "harness" }
    },
    {
      id: f.eventIds.stockTransfer,
      moduleId: "shop",
      entityType: "shop_stock_movement",
      entityLocalId: f.eventIds.stockTransfer,
      operation: "create",
      createdAt: now,
      payload: { type: "transfer", productId: f.productId, fromLocationId: f.locationAId, toLocationId: f.locationBId, qty: "3", note: "harness" }
    },
    {
      id: f.eventIds.invCreate,
      moduleId: "shop",
      entityType: "shop_invoice",
      entityLocalId: f.invoiceId,
      operation: "create",
      createdAt: now,
      payload: { id: f.invoiceId, kind: "sale", locationId: f.locationAId, customerId: f.customerId }
    },
    {
      id: f.eventIds.invUpdate,
      moduleId: "shop",
      entityType: "shop_invoice",
      entityLocalId: f.invoiceId,
      operation: "update",
      createdAt: now,
      payload: {
        id: f.invoiceId,
        locationId: f.locationAId,
        customerId: f.customerId,
        invoiceDiscountAmount: "0",
        taxEnabled: false,
        taxRate: "0",
        lines: [{ productId: f.productId, quantity: "2", unitPrice: "100.00", discountAmount: "0.00" }]
      }
    },
    { id: f.eventIds.invPost, moduleId: "shop", entityType: "shop_invoice", entityLocalId: f.invoiceId, operation: "post", createdAt: now, payload: { id: f.invoiceId } }
  ];

  return events.map((e) => buildEvent(e, tenantId));
}

function shopPurchaseScenarioEvents(fixtures, tenantId) {
  const f = fixtures.shop;
  const now = new Date().toISOString();
  const events = [
    {
      id: f.eventIds.pinvCreate,
      moduleId: "shop",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "create",
      createdAt: now,
      payload: { id: f.purchaseInvoiceId, kind: "purchase", locationId: f.locationAId, supplierId: f.supplierId, currencyCode: "AFN", notes: "harness" }
    },
    {
      id: f.eventIds.pinvUpdate,
      moduleId: "shop",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "update",
      createdAt: now,
      payload: {
        id: f.purchaseInvoiceId,
        supplierId: f.supplierId,
        locationId: f.locationAId,
        notes: "harness",
        lines: [{ productId: f.productId, quantity: "4", unitCost: "50.00" }]
      }
    },
    {
      id: f.eventIds.pinvReceive,
      moduleId: "shop",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "receive",
      createdAt: now,
      payload: { id: f.purchaseInvoiceId, receive: { note: "harness", lines: [{ productId: f.productId, qty: "4", unitCost: "50.00" }] } }
    },
    { id: f.eventIds.pinvPost, moduleId: "shop", entityType: "shop_purchase_invoice", entityLocalId: f.purchaseInvoiceId, operation: "post", createdAt: now, payload: { id: f.purchaseInvoiceId } },
    {
      id: f.eventIds.pinvPay,
      moduleId: "shop",
      entityType: "shop_purchase_invoice_payment",
      entityLocalId: f.eventIds.pinvPay,
      operation: "create",
      createdAt: now,
      payload: { id: f.eventIds.pinvPay, invoiceId: f.purchaseInvoiceId, direction: "out", method: "Cash", amount: "20.00", note: "harness" }
    }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyScenarioEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [
    { id: f.eventIds.unitCreate, moduleId: "pharmacy", entityType: "shop_unit", entityLocalId: f.unitId, operation: "create", createdAt: now, payload: { id: f.unitId, name: "Tablet", symbol: "tab" } },
    { id: f.eventIds.locACreate, moduleId: "pharmacy", entityType: "shop_location", entityLocalId: f.locationAId, operation: "create", createdAt: now, payload: { id: f.locationAId, name: "Pharmacy Main" } },
    { id: f.eventIds.locBCreate, moduleId: "pharmacy", entityType: "shop_location", entityLocalId: f.locationBId, operation: "create", createdAt: now, payload: { id: f.locationBId, name: "Pharmacy Second" } },
    { id: f.eventIds.catCreate, moduleId: "pharmacy", entityType: "shop_category", entityLocalId: f.categoryId, operation: "create", createdAt: now, payload: { id: f.categoryId, name: "Pharmacy", parentId: null } },
    { id: f.eventIds.supplierCreate, moduleId: "pharmacy", entityType: "shop_supplier", entityLocalId: f.supplierId, operation: "create", createdAt: now, payload: { id: f.supplierId, name: "Pharmacy Supplier", phone: null, email: null, address: null, notes: null } },
    {
      id: f.eventIds.productCreate,
      moduleId: "pharmacy",
      entityType: "shop_product",
      entityLocalId: f.productId,
      operation: "create",
      createdAt: now,
      payload: { id: f.productId, name: "Rx Product", sku: "RX-001", sellPrice: "30.00", unitId: f.unitId, categoryId: f.categoryId, costPrice: "10.00", barcodes: [] }
    },
    {
      id: f.eventIds.stockReceive,
      moduleId: "pharmacy",
      entityType: "shop_stock_movement",
      entityLocalId: f.eventIds.stockReceive,
      operation: "create",
      createdAt: now,
      payload: { type: "receive", productId: f.productId, locationId: f.locationAId, qty: "5", note: "harness" }
    },
    {
      id: f.eventIds.stockTransfer,
      moduleId: "pharmacy",
      entityType: "shop_stock_movement",
      entityLocalId: f.eventIds.stockTransfer,
      operation: "create",
      createdAt: now,
      payload: { type: "transfer", productId: f.productId, fromLocationId: f.locationAId, toLocationId: f.locationBId, qty: "2", note: "harness" }
    }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyPurchaseScenarioEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const expiryDate = "2030-01-01";
  const events = [
    {
      id: f.eventIds.pinvCreate,
      moduleId: "pharmacy",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "create",
      createdAt: now,
      payload: { id: f.purchaseInvoiceId, kind: "purchase", locationId: f.locationAId, supplierId: f.supplierId, currencyCode: "AFN", notes: "harness" }
    },
    {
      id: f.eventIds.pinvUpdate,
      moduleId: "pharmacy",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "update",
      createdAt: now,
      payload: { id: f.purchaseInvoiceId, supplierId: f.supplierId, locationId: f.locationAId, notes: "harness", lines: [{ id: f.purchaseInvoiceLineId, productId: f.productId, quantity: "2", unitCost: "8.00" }] }
    },
    {
      id: f.eventIds.pinvReceive,
      moduleId: "pharmacy",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseInvoiceId,
      operation: "receive",
      createdAt: now,
      payload: { id: f.purchaseInvoiceId, receive: { note: "harness", lines: [{ lineId: f.purchaseInvoiceLineId, qty: "2", lotNumber: "LOT1", expiryDate }] } }
    },
    { id: f.eventIds.pinvPost, moduleId: "pharmacy", entityType: "shop_purchase_invoice", entityLocalId: f.purchaseInvoiceId, operation: "post", createdAt: now, payload: { id: f.purchaseInvoiceId } }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyInvoiceScenarioEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [
    { id: f.eventIds.invCreate, moduleId: "pharmacy", entityType: "shop_invoice", entityLocalId: f.invoiceId, operation: "create", createdAt: now, payload: { id: f.invoiceId, kind: "sale", locationId: f.locationAId, customerId: null } },
    {
      id: f.eventIds.invUpdate,
      moduleId: "pharmacy",
      entityType: "shop_invoice",
      entityLocalId: f.invoiceId,
      operation: "update",
      createdAt: now,
      payload: {
        id: f.invoiceId,
        locationId: f.locationAId,
        customerId: null,
        invoiceDiscountAmount: "0",
        taxEnabled: false,
        taxRate: "0",
        lines: [{ id: f.invoiceLineId, productId: f.productId, quantity: "1", unitPrice: "30.00", discountAmount: "0.00" }]
      }
    },
    { id: f.eventIds.invPost, moduleId: "pharmacy", entityType: "shop_invoice", entityLocalId: f.invoiceId, operation: "post", createdAt: now, payload: { id: f.invoiceId } }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyRefundDraftPostEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [
    {
      id: f.eventIds.refundDraft,
      moduleId: "pharmacy",
      entityType: "shop_invoice",
      entityLocalId: f.refundInvoiceId,
      operation: "refund_draft",
      createdAt: now,
      payload: { id: f.refundInvoiceId, refundOfId: f.invoiceId, restockOnRefund: true, lines: [{ productId: f.productId, quantity: "1" }] }
    },
    { id: f.eventIds.refundPost, moduleId: "pharmacy", entityType: "shop_invoice", entityLocalId: f.refundInvoiceId, operation: "post", createdAt: now, payload: { id: f.refundInvoiceId } }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyRefundVoidEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [{ id: f.eventIds.refundVoid, moduleId: "pharmacy", entityType: "shop_invoice", entityLocalId: f.refundInvoiceId, operation: "void", createdAt: now, payload: { id: f.refundInvoiceId } }];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyPurchaseRefundScenarioEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [
    {
      id: f.eventIds.pinvRefundDraft,
      moduleId: "pharmacy",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseRefundInvoiceId,
      operation: "refund_draft",
      createdAt: now,
      payload: { id: f.purchaseRefundInvoiceId, refundOfId: f.purchaseInvoiceId }
    },
    {
      id: f.eventIds.pinvRefundUpdate,
      moduleId: "pharmacy",
      entityType: "shop_purchase_invoice",
      entityLocalId: f.purchaseRefundInvoiceId,
      operation: "update",
      createdAt: now,
      payload: {
        id: f.purchaseRefundInvoiceId,
        lines: [{ id: f.purchaseRefundLineId, productId: f.productId, quantity: "1", unitCost: "8.00" }]
      }
    },
    { id: f.eventIds.pinvRefundPost, moduleId: "pharmacy", entityType: "shop_purchase_invoice", entityLocalId: f.purchaseRefundInvoiceId, operation: "post", createdAt: now, payload: { id: f.purchaseRefundInvoiceId } }
  ];
  return events.map((e) => buildEvent(e, tenantId));
}

function pharmacyPurchaseRefundVoidEvents(fixtures, tenantId) {
  const f = fixtures.pharmacy;
  const now = new Date().toISOString();
  const events = [{ id: f.eventIds.pinvRefundVoid, moduleId: "pharmacy", entityType: "shop_purchase_invoice", entityLocalId: f.purchaseRefundInvoiceId, operation: "void", createdAt: now, payload: { id: f.purchaseRefundInvoiceId } }];
  return events.map((e) => buildEvent(e, tenantId));
}

function getStockQty(pullJson, productId, locationId) {
  const items = Array.isArray(pullJson?.data?.stockItems) ? pullJson.data.stockItems : [];
  for (const r of items) {
    if (r && r.productId === productId && r.locationId === locationId) return String(r.onHandQty ?? "0");
  }
  return "0";
}

function getLotQty(pullJson, productId, locationId, lotNumber, expiryDate) {
  const lots = Array.isArray(pullJson?.data?.lots) ? pullJson.data.lots : [];
  for (const l of lots) {
    if (!l) continue;
    if (l.productId !== productId) continue;
    if (l.locationId !== locationId) continue;
    if (l.lotNumber !== lotNumber) continue;
    const exp = l.expiryDate ?? null;
    if (!exp) continue;
    if (!String(exp).startsWith(expiryDate)) continue;
    return String(l.onHandQty ?? "0");
  }
  return "0";
}

function countPurchaseReceipts(pullJson, purchaseInvoiceLineId) {
  const receipts = Array.isArray(pullJson?.data?.purchaseLotReceipts) ? pullJson.data.purchaseLotReceipts : [];
  return receipts.filter((r) => r && r.purchaseInvoiceLineId === purchaseInvoiceLineId).length;
}

function sumPurchaseReceiptsQty(pullJson, purchaseInvoiceLineId) {
  const receipts = Array.isArray(pullJson?.data?.purchaseLotReceipts) ? pullJson.data.purchaseLotReceipts : [];
  let sum = 0;
  for (const r of receipts) {
    if (!r || r.purchaseInvoiceLineId !== purchaseInvoiceLineId) continue;
    sum += Number(r.quantity ?? "0") || 0;
  }
  return String(sum.toFixed(3));
}

function countInvoiceAllocations(pullJson, invoiceId, lotNumber, expiryDate) {
  const allocs = Array.isArray(pullJson?.data?.invoiceLotAllocations) ? pullJson.data.invoiceLotAllocations : [];
  return allocs.filter((a) => {
    if (!a) return false;
    if (a.invoice?.id !== invoiceId) return false;
    const lot = a.lot ?? null;
    if (!lot) return false;
    if (lot.lotNumber !== lotNumber) return false;
    const exp = lot.expiryDate ?? null;
    if (!exp) return false;
    if (!String(exp).startsWith(expiryDate)) return false;
    return true;
  }).length;
}

function requireQty(actual, expected, label) {
  if (String(actual) !== String(expected)) die(`Stock mismatch for ${label}: expected ${expected}, got ${actual}`);
}

const argv = process.argv.slice(2);
const baseUrl = (process.env.ONEERP_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const token = process.env.ONEERP_ACCESS_TOKEN ?? "";
const tenantId = process.env.ONEERP_TENANT_ID ?? "";
if (!token || !tenantId) {
  die(
    [
      "Missing env vars.",
      "Required:",
      "  ONEERP_ACCESS_TOKEN=...",
      "  ONEERP_TENANT_ID=...",
      "Optional:",
      "  ONEERP_API_BASE_URL=http://localhost:4000"
    ].join("\n")
  );
}

const fixturesPath = path.resolve(process.cwd(), getArg(argv, "--fixtures") ?? "tools/offline-push-fixtures.json");

if (hasArg(argv, "--file") || (argv[0] && !argv[0].startsWith("--"))) {
  const fileArg = getArg(argv, "--file") ?? argv[0];
  const inputPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(inputPath)) die(`Input file not found: ${inputPath}`);
  const input = normalizeInput(readJson(inputPath));
  const items = input.items.map(toEventAndExpect);
  const events = items.map((x) => buildEvent(x.event, tenantId));
  const expectations = new Map(items.map((x) => [x.event?.id, pickExpected(x.expect)]).filter((x) => x[0] && x[1]));
  const pushed = await pushEvents(baseUrl, token, tenantId, events, expectations);
  process.stdout.write(JSON.stringify({ ok: true, processed: pushed?.data?.processed ?? null }, null, 2) + "\n");
  process.exit(0);
}

const fixtures = ensureFixtures(fixturesPath, tenantId);

const shopEvents = shopScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH shop (1)\n");
const shopPush1 = await pushEvents(baseUrl, token, tenantId, shopEvents, new Map());
const shopPull1 = await pullModule(baseUrl, token, tenantId, "shop");
requireQty(getStockQty(shopPull1, fixtures.shop.productId, fixtures.shop.locationAId), "5", "shop:locationA");
requireQty(getStockQty(shopPull1, fixtures.shop.productId, fixtures.shop.locationBId), "3", "shop:locationB");

const purchaseEvents = shopPurchaseScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH shop purchases (1)\n");
const purchasePush1 = await pushEvents(baseUrl, token, tenantId, purchaseEvents, new Map());
const shopPull2 = await pullModule(baseUrl, token, tenantId, "shop");
requireQty(getStockQty(shopPull2, fixtures.shop.productId, fixtures.shop.locationAId), "9", "shop:locationA after purchase receive");

const pharmacyEvents = pharmacyScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy (1)\n");
const pharmacyPush1 = await pushEvents(baseUrl, token, tenantId, pharmacyEvents, new Map());
const pharmacyPull1 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPull1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "3", "pharmacy:locationA");
requireQty(getStockQty(pharmacyPull1, fixtures.pharmacy.productId, fixtures.pharmacy.locationBId), "2", "pharmacy:locationB");

const pharmacyPurchaseEvents = pharmacyPurchaseScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy purchases (1)\n");
const pharmacyPurchasePush1 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseEvents, new Map());
const pharmacyPull2 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPull2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "5", "pharmacy:locationA after purchase receive");
requireQty(getLotQty(pharmacyPull2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "2", "pharmacy:LOT1 qty");
requireQty(countPurchaseReceipts(pharmacyPull2, fixtures.pharmacy.purchaseInvoiceLineId), "1", "pharmacy:purchase receipts count");

const pharmacyInvoiceEvents = pharmacyInvoiceScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy invoices (1)\n");
const pharmacyInvoicePush1 = await pushEvents(baseUrl, token, tenantId, pharmacyInvoiceEvents, new Map());
const pharmacyPullInv1 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPullInv1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "4", "pharmacy:locationA after sale invoice");
requireQty(getLotQty(pharmacyPullInv1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "1", "pharmacy:LOT1 qty after sale invoice");
requireQty(countInvoiceAllocations(pharmacyPullInv1, fixtures.pharmacy.invoiceId, "LOT1", "2030-01-01"), "1", "pharmacy:invoice allocations count");

const pharmacyRefundDraftPost = pharmacyRefundDraftPostEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy refunds (1)\n");
const pharmacyRefundPush1 = await pushEvents(baseUrl, token, tenantId, pharmacyRefundDraftPost, new Map());
const pharmacyPullRefund1 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPullRefund1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "5", "pharmacy:locationA after refund post");
requireQty(getLotQty(pharmacyPullRefund1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "2", "pharmacy:LOT1 qty after refund post");
requireQty(countInvoiceAllocations(pharmacyPullRefund1, fixtures.pharmacy.refundInvoiceId, "LOT1", "2030-01-01"), "1", "pharmacy:refund allocations count");

const pharmacyRefundVoid = pharmacyRefundVoidEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy refund void (1)\n");
const pharmacyRefundVoidPush1 = await pushEvents(baseUrl, token, tenantId, pharmacyRefundVoid, new Map());
const pharmacyPullRefund2 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPullRefund2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "4", "pharmacy:locationA after refund void");
requireQty(getLotQty(pharmacyPullRefund2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "1", "pharmacy:LOT1 qty after refund void");
requireQty(countInvoiceAllocations(pharmacyPullRefund2, fixtures.pharmacy.refundInvoiceId, "LOT1", "2030-01-01"), "0", "pharmacy:refund allocations count after void");

const pharmacyPurchaseRefundEvents = pharmacyPurchaseRefundScenarioEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy purchase refunds (1)\n");
const pharmacyPurchaseRefundPush1 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseRefundEvents, new Map());
const pharmacyPullPurchRefund1 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPullPurchRefund1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "3", "pharmacy:locationA after purchase refund");
requireQty(getLotQty(pharmacyPullPurchRefund1, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "0", "pharmacy:LOT1 qty after purchase refund");
requireQty(sumPurchaseReceiptsQty(pharmacyPullPurchRefund1, fixtures.pharmacy.purchaseRefundLineId), "-1.000", "pharmacy:purchase refund receipts sum");

const pharmacyPurchaseRefundVoid = pharmacyPurchaseRefundVoidEvents(fixtures, tenantId);
process.stdout.write("PUSH pharmacy purchase refund void (1)\n");
const pharmacyPurchaseRefundVoidPush1 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseRefundVoid, new Map());
const pharmacyPullPurchRefund2 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPullPurchRefund2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "4", "pharmacy:locationA after purchase refund void");
requireQty(getLotQty(pharmacyPullPurchRefund2, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "1", "pharmacy:LOT1 qty after purchase refund void");
requireQty(sumPurchaseReceiptsQty(pharmacyPullPurchRefund2, fixtures.pharmacy.purchaseRefundLineId), "0.000", "pharmacy:purchase refund receipts sum after void");

process.stdout.write("PUSH shop (2)\n");
const shopPush2 = await pushEvents(baseUrl, token, tenantId, shopEvents, new Map());
process.stdout.write("PUSH shop purchases (2)\n");
const purchasePush2 = await pushEvents(baseUrl, token, tenantId, purchaseEvents, new Map());
process.stdout.write("PUSH pharmacy (2)\n");
const pharmacyPush2 = await pushEvents(baseUrl, token, tenantId, pharmacyEvents, new Map());
process.stdout.write("PUSH pharmacy purchases (2)\n");
const pharmacyPurchasePush2 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseEvents, new Map());
process.stdout.write("PUSH pharmacy invoices (2)\n");
const pharmacyInvoicePush2 = await pushEvents(baseUrl, token, tenantId, pharmacyInvoiceEvents, new Map());
process.stdout.write("PUSH pharmacy refunds (2)\n");
const pharmacyRefundPush2 = await pushEvents(baseUrl, token, tenantId, pharmacyRefundDraftPost, new Map());
process.stdout.write("PUSH pharmacy refund void (2)\n");
const pharmacyRefundVoidPush2 = await pushEvents(baseUrl, token, tenantId, pharmacyRefundVoid, new Map());
process.stdout.write("PUSH pharmacy purchase refunds (2)\n");
const pharmacyPurchaseRefundPush2 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseRefundEvents, new Map());
process.stdout.write("PUSH pharmacy purchase refund void (2)\n");
const pharmacyPurchaseRefundVoidPush2 = await pushEvents(baseUrl, token, tenantId, pharmacyPurchaseRefundVoid, new Map());

const shopPull3 = await pullModule(baseUrl, token, tenantId, "shop");
requireQty(getStockQty(shopPull3, fixtures.shop.productId, fixtures.shop.locationAId), "9", "shop:locationA idempotency");
requireQty(getStockQty(shopPull3, fixtures.shop.productId, fixtures.shop.locationBId), "3", "shop:locationB idempotency");

const pharmacyPull3 = await pullModule(baseUrl, token, tenantId, "pharmacy");
requireQty(getStockQty(pharmacyPull3, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId), "4", "pharmacy:locationA idempotency");
requireQty(getStockQty(pharmacyPull3, fixtures.pharmacy.productId, fixtures.pharmacy.locationBId), "2", "pharmacy:locationB idempotency");
requireQty(getLotQty(pharmacyPull3, fixtures.pharmacy.productId, fixtures.pharmacy.locationAId, "LOT1", "2030-01-01"), "1", "pharmacy:LOT1 qty idempotency");
requireQty(countPurchaseReceipts(pharmacyPull3, fixtures.pharmacy.purchaseInvoiceLineId), "1", "pharmacy:purchase receipts count idempotency");
requireQty(countInvoiceAllocations(pharmacyPull3, fixtures.pharmacy.invoiceId, "LOT1", "2030-01-01"), "1", "pharmacy:invoice allocations count idempotency");
requireQty(countInvoiceAllocations(pharmacyPull3, fixtures.pharmacy.refundInvoiceId, "LOT1", "2030-01-01"), "0", "pharmacy:refund allocations count idempotency");
requireQty(sumPurchaseReceiptsQty(pharmacyPull3, fixtures.pharmacy.purchaseRefundLineId), "0.000", "pharmacy:purchase refund receipts sum idempotency");

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      fixtures: path.relative(process.cwd(), fixturesPath),
      shopFirstProcessed: shopPush1?.data?.processed ?? null,
      shopSecondProcessed: shopPush2?.data?.processed ?? null,
      purchaseFirstProcessed: purchasePush1?.data?.processed ?? null,
      purchaseSecondProcessed: purchasePush2?.data?.processed ?? null,
      pharmacyFirstProcessed: pharmacyPush1?.data?.processed ?? null,
      pharmacySecondProcessed: pharmacyPush2?.data?.processed ?? null,
      pharmacyPurchaseFirstProcessed: pharmacyPurchasePush1?.data?.processed ?? null,
      pharmacyPurchaseSecondProcessed: pharmacyPurchasePush2?.data?.processed ?? null,
      pharmacyInvoiceFirstProcessed: pharmacyInvoicePush1?.data?.processed ?? null,
      pharmacyInvoiceSecondProcessed: pharmacyInvoicePush2?.data?.processed ?? null,
      pharmacyRefundFirstProcessed: pharmacyRefundPush1?.data?.processed ?? null,
      pharmacyRefundSecondProcessed: pharmacyRefundPush2?.data?.processed ?? null,
      pharmacyRefundVoidFirstProcessed: pharmacyRefundVoidPush1?.data?.processed ?? null,
      pharmacyRefundVoidSecondProcessed: pharmacyRefundVoidPush2?.data?.processed ?? null,
      pharmacyPurchaseRefundFirstProcessed: pharmacyPurchaseRefundPush1?.data?.processed ?? null,
      pharmacyPurchaseRefundSecondProcessed: pharmacyPurchaseRefundPush2?.data?.processed ?? null,
      pharmacyPurchaseRefundVoidFirstProcessed: pharmacyPurchaseRefundVoidPush1?.data?.processed ?? null,
      pharmacyPurchaseRefundVoidSecondProcessed: pharmacyPurchaseRefundVoidPush2?.data?.processed ?? null
    },
    null,
    2
  ) + "\n"
);
