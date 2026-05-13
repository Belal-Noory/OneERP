import { IsOptional, IsString } from "class-validator";

export class CustomerLedgerQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

