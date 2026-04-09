import { Body, Controller, HttpException, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { PasswordResetConfirmDto, PasswordResetRequestDto } from "./dto/password-reset.dto";

const ACCESS_COOKIE = "oneerp_access";
const REFRESH_COOKIE = "oneerp_refresh";

function parseDurationMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const v = raw.trim();
  const m = v.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  if (u === "s") return n * 1000;
  if (u === "m") return n * 60 * 1000;
  if (u === "h") return n * 60 * 60 * 1000;
  if (u === "d") return n * 24 * 60 * 60 * 1000;
  return fallbackMs;
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string, accessMaxAgeMs: number) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: accessMaxAgeMs
  });
  const refreshMaxAgeMs = parseDurationMs(process.env.TOKEN_TTL_REFRESH, 30 * 24 * 60 * 60 * 1000);
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: refreshMaxAgeMs
  });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body);
    setAuthCookies(res, result.data.auth.accessToken, result.data.auth.refreshToken, result.data.auth.expiresInSeconds * 1000);
    return result;
  }

  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body);
    setAuthCookies(res, result.data.auth.accessToken, result.data.auth.refreshToken, result.data.auth.expiresInSeconds * 1000);
    return result;
  }

  @Post("logout")
  async logout(@Req() req: { cookies?: Record<string, unknown> }, @Body() body: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokenFromBody = body.refreshToken;
    const tokenFromCookie = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? (req.cookies[REFRESH_COOKIE] as string) : undefined;
    const refreshToken = tokenFromBody ?? tokenFromCookie;
    if (!refreshToken) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }
    const result = await this.auth.logout(refreshToken);
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    return result;
  }

  @Post("refresh")
  async refresh(@Req() req: { cookies?: Record<string, unknown> }, @Body() body: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokenFromBody = body.refreshToken;
    const tokenFromCookie = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? (req.cookies[REFRESH_COOKIE] as string) : undefined;
    const refreshToken = tokenFromBody ?? tokenFromCookie;
    if (!refreshToken) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }
    const result = await this.auth.refresh(refreshToken);
    setAuthCookies(res, result.data.accessToken, result.data.refreshToken, result.data.expiresInSeconds * 1000);
    return result;
  }

  @Post("password-reset/request")
  async requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post("password-reset/confirm")
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(body.token, body.newPassword);
  }
}
