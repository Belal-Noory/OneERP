import { IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsIn(["Owner", "Admin", "Manager", "Staff", "ReadOnly"])
  roleName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleIds?: string[];
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsString()
  @IsIn(["Owner", "Admin", "Manager", "Staff", "ReadOnly"])
  roleName?: string;

  @IsOptional()
  @IsString()
  @IsIn(["active", "invited", "suspended"])
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleIds?: string[];
}
