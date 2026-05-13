import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { OwnerController } from "./owner.controller";

@Module({
  imports: [PrismaModule],
  controllers: [OwnerController]
})
export class OwnerModule {}

