import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class ListCashSessionsQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["open", "closed", "all"])
  status?: string;

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

export class OpenCashSessionDto {
  @IsString()
  locationId!: string;

  @IsString()
  @Matches(PRICE_RE)
  openingCash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CashSessionCashDto {
  @IsString()
  @Matches(PRICE_RE)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CloseCashSessionDto {
  @IsString()
  @Matches(PRICE_RE)
  countedCash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

