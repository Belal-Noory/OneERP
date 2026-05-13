import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["en", "fa", "ps"])
  locale?: string;
}

