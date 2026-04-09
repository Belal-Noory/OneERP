import { Controller, Get, HttpException, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { memoryStorage } from "multer";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";

const MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_ROOT = path.join(process.cwd(), "apps", "api", "storage");

type RequestWithTenant = { tenantId: string };
type RequestWithQuery = { query?: { purpose?: string } };

@Controller("files")
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES }
    })
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: RequestWithTenant & RequestWithQuery) {
    if (!file) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const contentType = file.mimetype ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const ext = this.extensionFromContentType(contentType);
    if (!ext) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
    }

    const purpose = req.query?.purpose?.trim() || "tenant_logo";
    if (purpose !== "tenant_logo" && purpose !== "shop_product_image") {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const id = randomUUID();
    const storageKey = path.posix.join(tenantId, `${id}${ext}`);
    const diskPath = path.join(STORAGE_ROOT, tenantId, `${id}${ext}`);
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, file.buffer);

    await this.prisma.file.create({
      data: {
        id,
        tenantId,
        purpose,
        originalName: file.originalname ?? "upload",
        contentType,
        sizeBytes: file.size,
        storageProvider: "local",
        storageKey
      }
    });

    return { data: { id, url: `/api/files/${id}` } };
  }

  @Get(":id")
  async getFile(@Param("id") id: string, @Res() res: Response) {
    const record = await this.prisma.file.findUnique({
      where: { id },
      select: { id: true, tenantId: true, contentType: true, storageKey: true }
    });
    if (!record) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const diskPath = path.join(STORAGE_ROOT, record.storageKey.replaceAll("/", path.sep));
    try {
      const buf = await fs.readFile(diskPath);
      res.setHeader("Content-Type", record.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
      return;
    } catch {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
  }

  private extensionFromContentType(contentType: string): string | null {
    if (contentType === "image/png") return ".png";
    if (contentType === "image/jpeg") return ".jpg";
    if (contentType === "image/webp") return ".webp";
    if (contentType === "image/svg+xml") return ".svg";
    return null;
  }
}
