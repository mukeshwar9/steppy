import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MinLength, MaxLength } from "class-validator";
export class RegisterDto { @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(8) @MaxLength(128) password!: string; @IsString() @MinLength(1) @MaxLength(80) displayName!: string; @Matches(/^[a-zA-Z0-9_]{3,24}$/) username!: string; }
export class LoginDto { @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(1) password!: string; }
export class RefreshDto { @IsString() @MinLength(20) refreshToken!: string; }
export class GoogleSignInDto { @IsString() @MinLength(20) credential!: string; @IsOptional() @IsString() credentialType?: "id_token" | "access_token"; }
