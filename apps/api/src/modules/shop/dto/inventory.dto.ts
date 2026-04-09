import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

const QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const DELTA_RE = /^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class CreateLocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(["true", "false"])
  isActive?: string;
}

export class ListInventoryQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export class ReceiveStockDto {
  @IsString()
  productId!: string;

  @IsString()
  locationId!: string;

  @IsString()
  @Matches(QTY_RE)
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class AdjustStockDto {
  @IsString()
  productId!: string;

  @IsString()
  locationId!: string;

  @IsString()
  @IsIn(["delta", "set"])
  mode!: string;

  @IsString()
  @Matches(DELTA_RE)
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class TransferStockLotDto {
  @IsString()
  lotId!: string;

  @IsString()
  @Matches(QTY_RE)
  qty!: string;
}

export class TransferStockDto {
  @IsString()
  productId!: string;

  @IsString()
  fromLocationId!: string;

  @IsString()
  toLocationId!: string;

  @IsString()
  @Matches(QTY_RE)
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferStockLotDto)
  lots?: TransferStockLotDto[];
}

export class ListMovementsQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

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

export class ListLotsQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(["all", "expired", "near", "ok", "no_expiry"])
  status?: string;

  @IsOptional()
  @IsString()
  nearDays?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
