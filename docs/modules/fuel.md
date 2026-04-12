# Fuel Station Management Module

## Purpose
Comprehensive management of retail fuel/pump stations. This module handles everything from underground tank inventory to shift-based pump sales, meter readings, and B2B fleet credit sales.

*Note: This replaces the older "fleet-only" concept to fully support retail gas stations selling to the public.*

## Scope & Core Features

### 1. Tank & Inventory Management
- **Underground/Above-ground Tanks:** Track capacity, current system volume, and fuel type (e.g., Super, Regular, Diesel, LPG, CNG).
- **Fuel Receivings (Purchases):** Log fuel deliveries from suppliers into specific tanks, automatically increasing inventory.
- **Dip Readings & Adjustments:** Record manual or automated dipstick readings to reconcile system volume vs. actual physical volume (handling evaporation/temperature expansion).

### 2. Pumps & Nozzles
- **Pumps (Islands):** Define physical pump stations.
- **Nozzles:** Map individual nozzles to specific Pumps and specific Tanks.
- **Totalizer Meters:** Track the non-resettable electronic or mechanical meter reading for every nozzle to prevent theft and track exact throughput.

### 3. Shift & Attendant Reconciliation (Crucial for Retail)
- **Shift Management:** Gas stations operate on shifts. An attendant opens a shift on a specific pump.
- **Opening/Closing Readings:** When a shift starts, opening meter readings are recorded. When it ends, closing readings are recorded.
- **Cash Reconciliation:** `(Closing Reading - Opening Reading) * Price = Expected Revenue`. The system calculates short/over amounts based on the cash/card the attendant hands in.

### 4. Sales & POS Integration
- **Direct Fuel Sales:** Fast logging of fuel sales by volume (Liters/Gallons) or by currency amount.
- **Shop POS Integration:** (Optional/Future) Ability to ring up fuel sales alongside convenience store items in the `Shop` module POS.
- **Price Management:** Centralized fuel pricing that updates across the system.

### 5. B2B Fleet & Credit Accounts
- **Credit Sales:** Allow local businesses/fleets to fill up on credit.
- **Vehicle/Driver Tracking:** Log which specific vehicle license plate or driver took the fuel.
- **Invoicing:** Generate monthly consolidated invoices for B2B customers.

## Permissions (fuel.* namespace)
- `fuel.tanks.view` / `fuel.tanks.manage`
- `fuel.pumps.view` / `fuel.pumps.manage`
- `fuel.shifts.view` / `fuel.shifts.manage` (Open/Close shifts, reconcile)
- `fuel.sales.view` / `fuel.sales.create`
- `fuel.reports.view`

## Audit Logging
All critical write actions must be logged:
- Changing fuel prices.
- Manual tank volume adjustments (dip readings).
- Shift reconciliations and cash discrepancies.

## Checklist
- [x] Spec refinement with user
- [x] Database Schema (Prisma) design (Tanks, Pumps, Nozzles, Shifts, Sales)
- [x] Backend API implementation
- [x] Frontend UI (Tank Dashboard, Shift Management, POS)

## Implementation status snapshot
- [x] Tanks + tank detail dashboard (receivings + dip readings)
- [x] Pumps + nozzles management
- [x] Shift open/close + reconciliation
- [x] Sales create/update/delete
