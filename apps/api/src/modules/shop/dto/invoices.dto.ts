import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const QTY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "posted", "void", "all"])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class CreateInvoicePaymentDto {
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

export class CreateRefundLineDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(QTY_RE)
  quantity!: string;
}

export class CreateRefundDraftDto {
  @IsOptional()
  @IsArray()
  lines?: CreateRefundLineDto[];

  @IsOptional()
  @IsBoolean()
  restockOnRefund?: boolean;
}

export class InvoiceLineInputDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(QTY_RE)
  quantity!: string;

  @IsString()
  @Matches(PRICE_RE)
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  discountAmount?: string;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  lines?: InvoiceLineInputDto[];

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  invoiceDiscountAmount?: string;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  taxRate?: string;

  @IsOptional()
  @IsBoolean()
  restockOnRefund?: boolean;
}
