# Owner Dashboard (Platform Admin)

## Purpose

Provide a separate “Owner” application (hosted on its own subdomain) for managing:
- Company registrations (tenants)
- Module subscription requests + approvals
- Module-level billing status (manual payments)
- Tenant/module locks when payments are overdue

This is designed for environments where online payments are not available (e.g., Afghanistan), so billing is handled manually by the platform owner.

## Key Rules

- Billing is **module-based** (a tenant pays per module).
- Tenants cannot enable modules directly. They can only **request activation**.
- A module becomes usable only after owner approval.
- For monthly subscriptions, after the period ends the tenant has **3 days grace**, then that **module is locked**.
- If a module is locked, users must not be able to open it from the tenant app; and if they are already inside it, they should be forced out (blocked + redirect/logout flow).

## Subscription Types (Owner selects during approval)

Each module request is approved into exactly one subscription type:

1) Online version — **$40 / month**
2) Desktop app + offline version (no changes) — **$1000 one-time**
3) Desktop app + offline version (with any changes) — **$2000 one-time**
   - Changes/support period: **3 months** from approval date

## Tenant App UX Changes

### Tenant Modules Page

- Replace “Enable” with “Request activation”.
- Show clear status per module:
  - Available (not requested)
  - Requested (pending approval)
  - Active (approved and enabled)
  - Locked (payment overdue)
  - Disabled (owner turned off)

### Module Entry / Usage Blocking

- If the module status is Locked, the user must not be able to open the module.
- If the module becomes locked while the user is logged in:
  - API returns a consistent error code (e.g. `MODULE_LOCKED`)
  - App should redirect the user away from the module and show a “Payment required” message.

## Owner App Screens

### 1) Owner Login

- Email + password login
- Separate from tenant login UI (but may use the same API auth system with a platform-only role)

### 2) Dashboard

- KPIs:
  - New tenants (last 7/30 days)
  - Pending module requests
  - Active monthly modules
  - Overdue modules (in grace)
  - Locked modules

### 3) Tenants (Companies)

List view:
- Tenant name, slug, created date
- Owner user (name, email, phone if present)
- Enabled modules count
- Outstanding overdue modules count

Tenant details:
- Company branding/contact info
- List of module subscriptions and their status
- Users (memberships) management:
  - View users who have access to the tenant
  - Add user to tenant by email + role
  - Generate an invite link for the user to set a password and join the tenant
- Manual actions:
  - Lock/unlock a module
  - Approve a pending request
  - Disable an active module

### 4) Module Requests

Queue view:
- Tenant
- Requested module
- Requested date
- Request note (optional)

Approval flow:
- Choose subscription type (Online monthly / Offline no-changes / Offline with changes)
- Set start date and (if monthly) next due date
- Save approval → module becomes Active for the tenant

### 5) Billing (Manual)

For monthly modules:
- Show current period end
- Show grace end
- Show status: Active / Grace / Locked
- “Mark as paid” action:
  - Extends the period end (e.g., +30 days)
  - Clears lock state
- “Set period end” action:
  - Sets the exact next due date (useful for manual renewals on custom schedules)
  - Recomputes grace end (period end + 3 days)
- “Activate module” action (billing setup):
  - For cases where a module is enabled but billing is not configured yet
  - Creates/updates the subscription item and unlocks access

For one-time modules:
- Mark as paid once
- For “with changes”: show support end date (approval date + 3 months)

## Data Model (Recommended)

Current schema has `SubscriptionItem` per tenant+module; it should be extended to support:

- `subscriptionType` (online_monthly | offline_no_changes | offline_with_changes)
- `priceAmount` (number) + `priceCurrency` (e.g. USD)
- `billingCycle` (monthly | one_time)
- `status` (requested | active | disabled | locked | rejected)
- `requestedAt`, `approvedAt`, `approvedByUserId`
- `currentPeriodStartAt`, `currentPeriodEndAt` (monthly)
- `graceEndsAt` (monthly) = periodEnd + 3 days
- `lockedAt` (when locked)
- `supportEndsAt` (offline_with_changes) = approvedAt + 3 months

Owner “registered users with company details” can be derived from:
- `Tenant` + `TenantBranding`
- `Membership` where role is owner (or first membership)
- `User`

## API (Recommended)

### Tenant-facing
- `POST /tenants/current/modules/:moduleId/request`
- `GET /tenants/current/modules` returns status including request/lock state

### Owner-facing (protected)
- `GET /owner/tenants`
- `GET /owner/tenants/:tenantId`
- `POST /owner/tenants/:tenantId/memberships`
- `GET /owner/module-requests`
- `POST /owner/module-requests/:tenantId/:moduleId/approve`
- `POST /owner/subscriptions/:tenantId/:moduleId/activate`
- `POST /owner/subscriptions/:tenantId/:moduleId/mark-paid`
- `POST /owner/subscriptions/:tenantId/:moduleId/set-period`
- `POST /owner/subscriptions/:tenantId/:moduleId/lock`
- `POST /owner/subscriptions/:tenantId/:moduleId/unlock`

## Seeding Owner Admin

Do not hardcode credentials in the repository.

Recommended approach:
- Seed the owner admin user only when environment variables are provided:
  - `OWNER_ADMIN_EMAIL`
  - `OWNER_ADMIN_PASSWORD`
  - `OWNER_ADMIN_NAME` (optional)

This prevents committing sensitive credentials into code or git history.
