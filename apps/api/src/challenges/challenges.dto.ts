import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
export class CreateChallengeDto { @IsString() @MinLength(1) @MaxLength(80) name!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsDateString() startAt!: string; @IsDateString() endAt!: string; @IsString() timezone!: string; }
export class InviteChallengeDto { @IsString() username!: string; }
