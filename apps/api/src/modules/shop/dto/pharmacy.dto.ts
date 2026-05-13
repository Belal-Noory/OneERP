import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProductPharmacyProfileDto {
  @IsOptional()
  @IsBoolean()
  trackLots?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;

  @IsOptional()
  @IsBoolean()
  isControlled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  form?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  strength?: string | null;
}

