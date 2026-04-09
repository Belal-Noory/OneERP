import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { OfflineController } from "./offline.controller";

@Module({
  imports: [PrismaModule],
  controllers: [OfflineController]
})
export class OfflineModule {}

