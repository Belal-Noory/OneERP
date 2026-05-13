import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "approved", "closed", "void", "all"])
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class PurchaseOrderLineInputDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(QTY_RE)
  quantity!: string;

  @IsString()
  @Matches(PRICE_RE)
  unitCost!: string;
}

export class CreatePurchaseOrderDto {
  @IsString()
  locationId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  lines?: PurchaseOrderLineInputDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  lines?: PurchaseOrderLineInputDto[];
}

