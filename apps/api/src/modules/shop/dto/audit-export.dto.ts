import { IsIn, IsOptional, IsString } from "class-validator";

export class ShopAuditExportLogDto {
  @IsIn(["csv", "xlsx"])
  format!: "csv" | "xlsx";

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

