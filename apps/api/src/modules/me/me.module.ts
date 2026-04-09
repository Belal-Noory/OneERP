import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { TenantGuard } from "../../shared/tenant.guard";

@Module({
  controllers: [MeController],
  providers: [TenantGuard]
})
export class MeModule {}

