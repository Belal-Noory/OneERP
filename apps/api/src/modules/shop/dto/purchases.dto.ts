import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class ListPurchaseInvoicesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "posted", "void", "all"])
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreatePurchaseInvoiceDto {
  @IsString()
  locationId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class PurchaseLineInputDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(QTY_RE)
  quantity!: string;

  @IsString()
  @Matches(PRICE_RE)
  unitCost!: string;
}

export class UpdatePurchaseInvoiceDto {
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
  lines?: PurchaseLineInputDto[];
}

export class ReceivePurchaseLineDto {
  @IsString()
  lineId!: string;

  @IsString()
  @Matches(QTY_RE)
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lotNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  expiryDate?: string;
}

export class ReceivePurchaseInvoiceDto {
  @IsArray()
  lines!: ReceivePurchaseLineDto[];
}

export class CreatePurchasePaymentDto {
  @IsString()
  @MaxLength(20)
  method!: string;

  @IsString()
  @Matches(PRICE_RE)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
