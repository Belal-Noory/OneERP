# Pharmacy Module

## Purpose

Provide a complete, standalone Pharmacy app/module for SaaS use in any country, with strict data separation from other modules (e.g. Shop), while reusing the same platform foundations (tenant, roles, permissions, audit logs, files, reports).

Pharmacy must be usable on its own: products, purchases, inventory, POS, invoices, refunds, cash sessions, suppliers/customers, and pharmacy-specific reporting.

## Principles

- Pharmacy is a first-class module: separate sidebar entry, separate routes, separate API namespace.
- Data is partitioned by module: the same tenant can enable Shop and Pharmacy simultaneously without mixing data.
- Defaults are global-ready: multi-currency, multi-tax, localization, RTL, configurable receipt/invoice templates.

## Data Separation

All pharmacy records must be scoped to the pharmacy module:
- Products/invoices/purchases/stock must not appear in Shop screens and must not be queryable from Shop endpoints.
- The recommended pattern is `moduleId` on “commerce core” tables with default `"shop"` and `"pharmacy"` for pharmacy data.
- Every pharmacy endpoint must apply `moduleId = "pharmacy"` filtering and must set `moduleId` on create.

## Functional Scope (Standard Pharmacy)

### Catalog
- Products with SKU + multiple barcodes + images + categories + units
- Variants (size/color/strength pack variations) and packaging multipliers (box = N pcs)
- Medicine profile: form, strength

### Purchases & Suppliers
- Supplier directory and supplier ledger
- Purchase orders (optional) and purchase invoices
- Receiving workflow
  - Lot/batch number + expiry date capture (configurable “required”)
  - Supplier invoice number capture (optional)

### Inventory
- Locations, stock on hand, stock movements
- Adjustments and transfers
- Lot inventory (per location) with:
  - FEFO (first-expiry-first-out) sale allocation
  - Expired lot blocking, near-expiry warnings
  - Recall/traceability: which invoices consumed a lot

### Sales / POS
- POS scanning supports:
  - Unit barcode
  - Packaging barcode (adds multiplier quantity)
- Invoices and refunds
- Cash sessions (open/close, cash in/out)
- Optional patient/customer attachment per invoice

### Reports
- Sales, profit, inventory valuation
- Expiry reports (near-expiry, expired)
- Lot trace/recall report

## Permissions

Pharmacy uses its own module access gate (`pharmacy` enabled + membership module access). Within the module, permissions can reuse existing namespaces where appropriate (e.g. `shop.products.*`, `shop.inventory.*`) or can be migrated to `pharmacy.*` later if needed. The primary requirement is: a user must not access pharmacy endpoints unless granted access to the Pharmacy module.

## Audit Logging

All write actions must be logged with enough metadata for traceability:
- Who did it (actor user)
- What changed (entity + action)
- Where it happened (location where relevant)
- Lot/batch identifiers for stock changes
- Invoice/purchase references for allocations and receipts

## Implementation Checklist

### Module shell (routes + nav + access)
- [x] Sidebar app entry + route (`/t/[tenantSlug]/pharmacy`)
- [x] Module enable/disable reflects immediately in sidebar
- [x] Membership module access gating (app-level access)
- [x] Pharmacy overview dashboard (KPIs + quick actions + quick-start guide)

### Data partition
- [x] `moduleId` partitioning on core commerce tables (products, invoices, purchase invoices, purchase orders)
- [x] `moduleId` partitioning on supporting master tables (locations, payment methods, categories, units, customers, suppliers, cash sessions)
- [x] Ensure all Shop endpoints filter `moduleId = "shop"` for all resources (inventory, reports, and any remaining endpoints)
- [x] Ensure all Pharmacy endpoints filter `moduleId = "pharmacy"` for all resources (inventory, reports, and any remaining endpoints)

### Pharmacy: Products
- [x] Pharmacy products list/create/edit UI
- [x] Pharmacy products API namespace (`/api/pharmacy/products`)
- [x] Medicine profile API + UI
- [x] Pharmacy variants/packaging UI (same capabilities as Shop, but in Pharmacy pages)
- [x] Pharmacy units/categories management + seed defaults (pharmacy-specific)
- [x] Pharmacy settings: currency/tax/rounding/receiving rules UI
- [x] Pharmacy barcode resolve endpoint for POS (`/api/pharmacy/pos/resolve`)

### Pharmacy: Purchases
- [x] Pharmacy suppliers pages + API
- [x] Pharmacy purchase invoices pages + API
- [x] Receiving supports lot/expiry capture (data model + UI capture)
- [x] Enforce lot/expiry requirement per product/tenant settings (not globally)

### Pharmacy: Inventory
- [x] Stock on hand, movements, adjustments, transfers (pharmacy routes + moduleId filtered)
- [x] Lot stock screens + expiry warnings (FEFO visibility)
- [x] Transfer: prefer moving by lots (select lots) when trackLots=true

### Pharmacy: Sales/POS
- [x] Pharmacy POS UI (separate from Shop POS)
- [x] Pharmacy invoices API (create/update/post/pay/get + print)
- [x] Post invoice allocates lots by FEFO and blocks expired (pharmacy invoices only)
- [x] Refund restock respects lot allocation (prefer original lots; fallback to RETURN lot)
- [x] Cash sessions (open/close, cash in/out) — pharmacy routes + UI

### Pharmacy: Reports
- [x] Near-expiry / expired report
- [x] Lot trace/recall report
- [x] Report exports (Excel + print/PDF) for pharmacy reports
- [x] Standard sales/profit/inventory valuation reports (pharmacy routes) + export (Excel + print/PDF)

### UX (busy pharmacy)
- [x] Pharmacy top navigation (tabs) + mobile bottom navigation
- [x] Fast invoice history (recent sales list + reprint + details)
- [x] Optional patient/customer capture in POS (quick add/search)
- [x] Barcode scanning support across pharmacy flows (POS + lists + create/edit + purchases)
- [x] Exports for key pharmacy lists (inventory, medicines, sales, purchases, suppliers, lots, movements)
