import { IsOptional, IsString } from "class-validator";

export class SetPeriodDto {
  @IsOptional()
  @IsString()
  currentPeriodEndAt?: string;
}

