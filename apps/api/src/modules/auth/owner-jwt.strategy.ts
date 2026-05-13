import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";

type JwtPayload = {
  sub: string;
};

@Injectable()
export class OwnerJwtStrategy extends PassportStrategy(Strategy, "owner-jwt") {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, unknown> } | undefined) =>
          typeof req?.cookies?.oneerp_owner_access === "string" ? (req.cookies.oneerp_owner_access as string) : null
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret"
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, fullName: true, email: true, isActive: true }
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }
}

