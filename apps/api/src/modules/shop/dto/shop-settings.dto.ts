import { IsBoolean, IsOptional, IsString, Matches } from "class-validator";

const CODE_RE = /^[A-Z]{3}$/;

export class UpdateShopSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(CODE_RE)
  sellCurrencyCode?: string;

  @IsOptional()
  @IsString()
  @Matches(CODE_RE)
  buyCurrencyCode?: string;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsString()
  taxRate?: string;

  @IsOptional()
  @IsString()
  cashRoundingIncrement?: string;

  @IsOptional()
  @IsBoolean()
  pharmacyReceivingRequireLotNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  pharmacyReceivingRequireExpiryDate?: boolean;
}
