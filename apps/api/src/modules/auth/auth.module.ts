import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { SignOptions } from "jsonwebtoken";
import { AuthController } from "./auth.controller";
import { OwnerAuthController } from "./owner-auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { OwnerJwtStrategy } from "./owner-jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: (process.env.TOKEN_TTL_ACCESS ?? "7d") as unknown as SignOptions["expiresIn"] }
    })
  ],
  controllers: [AuthController, OwnerAuthController],
  providers: [AuthService, JwtStrategy, OwnerJwtStrategy],
  exports: [AuthService]
})
export class AuthModule {}
