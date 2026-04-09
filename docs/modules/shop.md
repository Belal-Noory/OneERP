# Shop Module

## Purpose

Full retail operations for small shops, large shops, and supermarkets:

- Product catalog and pricing
- Barcode/SKU operations
- Inventory tracking across one or more locations
- Purchasing and receiving stock
- Sales (POS flow + invoices)
- Returns and refunds
- Customer and supplier management
- Reporting and exports (PDF/XLSX)

## Scope boundaries (v1)

In v1 we prioritize a complete “core loop”:

1) Products
2) Stock
3) Sales invoice
4) Reports

## Roles and permissions

Permissions use the `shop.*` namespace. Examples:

- `shop.products.read|create|update|delete`
- `shop.inventory.read|adjust|transfer`
- `shop.locations.read|create|update`
- `shop.customers.read|create|update|delete`
- `shop.invoices.read|create|update|post|delete`
- `shop.reports.read|export`

## Core entities (conceptual)

- Product
  - name, category, barcode(s), sku, unit
  - pricing tiers (optional)
  - variants (optional v2)
  - tax category (optional)
- Location (warehouse/store)
- StockItem (per product per location)
- StockMovement (receive/adjust/transfer/sale/return)
- Customer
- Supplier
- Invoice / Sale
  - line items, discounts, taxes, payments
- PaymentMethod (tenant catalog)
- InvoicePayment (recorded payments)

## Screens (app routes)

- `/t/{tenantSlug}/shop` (overview)
- `/t/{tenantSlug}/shop/products`
- `/t/{tenantSlug}/shop/inventory`
- `/t/{tenantSlug}/shop/orders`
- `/t/{tenantSlug}/shop/customers`
- `/t/{tenantSlug}/shop/reports`

## UX requirements

- Fast search everywhere (barcode, sku, name)
- Keyboard-first POS workflow (v2)
- Multi-language UI (EN/FA/PS)
- RTL support (FA/PS)
- Branded confirmations (no browser confirm)
- Print formats: Thermal (80mm) + A4

## Audit logging

Record audit events for all write actions:

- product.create/update/delete
- inventory.receive/adjust/transfer
- invoice.create/update/post/delete
- invoice.payment.create
- paymentMethod.create
- report.export

## Delivery plan

### Phase 1: Products (start here)

- Product list (search, filters, pagination)
- Create product (name, sku, barcode, category, unit, image, details, price)
- Edit product
- Soft delete (optional)

### Phase 2: Inventory

- Locations
- Stock view (by location)
- Stock adjustment
- Stock receiving (purchase receiving simplified)
- Stock transfer (between locations)
- No negative stock (default)

### Phase 3: Sales

- Invoice create (select product, quantity, price)
- Customer assignment
- Payments (record payments + balance tracking)
- Payment methods (predefined + custom per tenant)
- Print/export invoice (Thermal 80mm + A4 + PDF export)
- Draft invoice delete

### Phase 4: Reports

- Sales summary
- Stock valuation (basic)
- Export to PDF/XLSX

## Next steps (Sales polish)

1) Invoice lifecycle (posted void/refund)
   - Void posted invoice should reverse stock movements (sale → reversal)
   - Optional refund flow and refund receipts (v2)
2) Better selling UX (barcode-first)
   - Barcode input that instantly adds item and increments quantity
3) Payments improvements
   - Method dropdown with quick-add (done) + enforce consistent naming (v2)
4) Print quality
   - Printer settings (58mm vs 80mm, margins, font size) and tighter alignment
5) Reports v1
   - Daily sales + payment-method totals + exports

## Checklist

- [x] Products API + UI
- [x] Categories API + UI
- [x] Inventory API + UI (locations, receive/adjust/transfer, movements)
- [x] Sales API + UI (draft/post, payments, print/PDF, delete draft)
- [x] Reports + exports
- [x] Audit logs UI

## Backlog (v2+) — Required for real-world shops/supermarkets (non‑pharmacy)

- [x] POS mode (fast selling screen)
  - Barcode-first add/increment, keyboard-first workflow
  - Quick product search, large touch targets for tablets
  - Draft sale flow optimized for speed
- [x] Discounts, taxes, and rounding
  - Line discount + invoice discount (amount/percent)
  - Optional tax settings (per tenant)
  - Cash rounding rules (market dependent)
- [x] Purchases & suppliers
  - Supplier management
  - Purchase orders + purchase receiving
  - Cost tracking to keep stock valuation and margins accurate (weighted average cost per stock item)
- [x] Cash register sessions (shift management)
  - Open/close shift, cash in/out, expected vs counted
  - Daily close (Z report) with print/export
- [x] Returns UX (partial returns)
  - Return selected items/quantities from an invoice
  - Return-to-stock toggle + refund payout method tracking
- [x] Product variants and packaging
  - Variants/attributes (size/color/etc.) for general retail
  - Packaging/unit conversions (box = N pcs) for supermarkets/wholesale
