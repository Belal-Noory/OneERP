import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateTankDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  fuelType!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  capacity!: number;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateTankDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  fuelType?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  capacity?: number;

  @IsString()
  @IsOptional()
  status?: string;
}

export class CreatePumpDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdatePumpDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class CreateNozzleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  pumpId!: string;

  @IsString()
  @IsNotEmpty()
  tankId!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  currentTotalizerReading?: number;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateNozzleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  tankId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  currentTotalizerReading?: number;

  @IsString()
  @IsOptional()
  status?: string;
}

export class CreateFuelReceivingDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  volumeReceived!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerUnit!: number;

  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;
}

export class CreateTankDipDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  measuredVolume!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
