import { IsIn, IsOptional, IsString } from "class-validator";

export class ReportExportLogDto {
  @IsString()
  reportId!: string;

  @IsIn(["pdf", "xlsx"])
  format!: "pdf" | "xlsx";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  threshold?: string;
}

