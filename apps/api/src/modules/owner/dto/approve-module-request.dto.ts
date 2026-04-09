import { IsIn, IsOptional, IsString, Matches } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class ApproveModuleRequestDto {
  @IsString()
  @IsIn(["online_monthly", "offline_no_changes", "offline_with_changes"])
  subscriptionType!: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  priceAmount?: string;

  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @IsOptional()
  @IsString()
  currentPeriodEndAt?: string;
}

