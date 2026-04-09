import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class PosResolveQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  code!: string;
}

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  sellPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attributes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  barcodes?: string[];
}

export class CreatePackagingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsString()
  @Matches(QTY_RE)
  multiplier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string | null;
}

export class UpdatePackagingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(QTY_RE)
  multiplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string | null;
}

