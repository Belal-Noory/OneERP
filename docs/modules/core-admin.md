# Core Tenant Admin (Platform)

## Purpose

Provide the tenant owner/admin with the tools to manage company setup, modules, staff access, and auditing.

## Users

- Owner
- Admin
- Manager (limited)

## Key screens

- Dashboard (tenant overview + setup checklist)
- Onboarding (company profile + branding + logo)
- Modules (catalog + enable/disable + open)
- Team (invite users, assign roles, suspend/activate)
- Audit logs (who did what, when)

## Permissions

- Platform permissions use the `platform.*` namespace.
- Owner: all permissions.
- Admin: all `platform.*` + all module permissions.
- Manager: read users/memberships + most module permissions except delete/export.

## Audit logging

Every admin action creates an audit log record:

- `tenant.create`, `auth.register`, `auth.login.success`
- `tenant.update`, `tenant.branding.update`
- `module.enable`, `module.disable`
- `team.invite`, `membership.invite`, `membership.update`, `membership.activate`

## Checklist

- [x] Tenant onboarding flow
- [x] Modules enable/disable
- [x] Team basic management + invite link
- [ ] Audit log UI page
- [ ] Role editor (custom roles per tenant)
- [ ] Subscription gating per module and per feature

