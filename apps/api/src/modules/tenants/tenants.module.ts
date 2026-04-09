import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller";
import { TenantGuard } from "../../shared/tenant.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";

@Module({
  controllers: [TenantsController],
  providers: [TenantGuard, PermissionsGuard]
})
export class TenantsModule {}

