import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePaymentMethodDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsIn(["cash", "card", "bank", "mobile", "other"])
  kind?: "cash" | "card" | "bank" | "mobile" | "other";
}

export class ListPaymentMethodsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
