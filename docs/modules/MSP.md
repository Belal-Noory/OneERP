====================================================
PUBLIC WEBSITE INTEGRATION
====================================================

The MSP / Sarafi module MUST also be integrated into the public oneERP website.

====================================================
PUBLIC WEBSITE REQUIREMENTS
====================================================

The public website MUST display MSP as an available module.

Module Card MUST include:
- Module name
- Description
- Key features
- Screenshots (future)
- Request Activation button (DONE)

Example:
MSP / Sarafi Management
- Currency Exchange
- Hawala Transfers
- Ledger System
- Multi-Branch Support

====================================================
MODULE ACTIVATION FLOW
====================================================

Users MUST be able to request activation of the MSP module from:

1. Public website (DONE)
2. Tenant dashboard (modules page) (DONE)

====================================================
ACTIVATION PROCESS
====================================================

Flow:

1. User logs into oneERP
2. User requests MSP activation
3. Request is sent to system admin
4. Admin approves/rejects request
   - Reject request flow (DONE)
5. Once approved:
   - Module becomes active for tenant
   - Sidebar updates automatically
   - Permissions become available

====================================================
DYNAMIC SIDEBAR RULES
====================================================

IMPORTANT:

The sidebar MUST be dynamic.

If MSP module is enabled:
- Show MSP navigation automatically

If MSP module is disabled:
- Remove MSP navigation automatically

This MUST happen synchronously based on:
- tenant subscription
- module activation status
- user permissions

====================================================
TENANT DASHBOARD INTEGRATION
====================================================

Once activated:

MSP module MUST automatically appear in:
- Desktop sidebar
- Mobile navigation
- Dashboard quick access (DONE)
- Module listing page

If disabled:
- Remove from ALL navigation areas
- Prevent route access (DONE)
- Prevent API access (DONE)

====================================================
NAVIGATION STRUCTURE RULES
====================================================

The MSP module MUST follow the SAME navigation structure as:
- Shop module
- Pharmacy module
- Fuel management module

DO NOT create a new navigation pattern.

====================================================
MSP SIDEBAR STRUCTURE
====================================================

Example:

MSP
 ├── Dashboard
 ├── Currency Exchange
 ├── Hawala Transfers
 ├── Customers
 ├── Partners
 ├── Branches
 ├── Ledger
 ├── Cash & Vault
 ├── Settlements
 ├── Reports
 ├── Audit Logs
 └── Settings

====================================================
MOBILE NAVIGATION RULES
====================================================

IMPORTANT:

The mobile navigation MUST follow the SAME responsive structure used in:
- Shop module
- Pharmacy module
- Fuel management module

Requirements:
- Responsive drawer/sidebar
- Mobile-friendly tables
- Mobile-friendly forms
- Touch-friendly buttons
- Optimized spacing

====================================================
RESPONSIVE DESIGN RULES
====================================================

The MSP module MUST be fully responsive on:

1. Mobile
2. Tablet
3. Laptop
4. Desktop
5. Large screens

====================================================
RESPONSIVE REQUIREMENTS
====================================================

Tables:
- Horizontal scrolling if needed
- Mobile card mode (future optional)

Forms:
- Responsive grid
- Single-column on small screens

Dashboard:
- Responsive KPI cards
- Adaptive charts

Sidebar:
- Collapsible on desktop
- Drawer on mobile

====================================================
UI CONSISTENCY RULES
====================================================

MSP MUST use:
- Same layout system
- Same spacing system
- Same typography
- Same component library
- Same breakpoints

DO NOT:
- Create custom responsive logic
- Create custom navigation components
- Introduce inconsistent UI behavior

====================================================
MODULE REGISTRY RULES
====================================================

MSP module MUST register itself in:
- Module registry (DONE)
- Sidebar registry (DONE)
- Permission registry (DONE)
- Route registry (DONE)

====================================================
PERMISSION SYNCHRONIZATION
====================================================

When module is activated:
- Generate module permissions (DONE)
- Sync sidebar visibility (DONE)
- Enable routes (DONE)
- Enable APIs (DONE)

When module is disabled:
- Hide sidebar
- Disable routes
- Disable APIs (DONE)

====================================================
SECURITY RULES
====================================================

Even if frontend hides the module:
Backend MUST still validate:
- tenant access
- module activation
- user permissions

Frontend hiding alone is NOT sufficient.

====================================================
FINAL IMPLEMENTATION RULE
====================================================

The MSP module MUST feel like:
- A native oneERP module
- Fully integrated
- Consistent with all existing modules

Users should NOT feel that MSP was added separately.
