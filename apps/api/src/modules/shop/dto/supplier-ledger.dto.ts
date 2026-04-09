import { IsOptional, IsString } from "class-validator";

export class SupplierLedgerQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

