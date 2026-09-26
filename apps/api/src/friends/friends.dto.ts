import { IsString, MinLength } from "class-validator";
export class FriendRequestDto { @IsString() @MinLength(3) username!: string; }
