import { Module } from "@nestjs/common";
import { MspController } from "./msp.controller";

@Module({
  controllers: [MspController]
})
export class MspModule {}

