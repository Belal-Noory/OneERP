import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

export class AddMembershipDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsString()
  @IsIn(["Owner", "Admin", "Staff"])
  roleName!: string;
}

