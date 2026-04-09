import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  status?: "active" | "archived";

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  symbol?: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  imageFileId?: string;

  @IsString()
  @Matches(PRICE_RE)
  sellPrice!: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  costPrice?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  barcodes?: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  imageFileId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  sellPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  costPrice?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  barcodes?: string[];
}
