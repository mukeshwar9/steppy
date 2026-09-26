import { Body, Controller, ForbiddenException, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { GoogleSignInDto, LoginDto, RefreshDto, RegisterDto } from "./auth.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("register") register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post("login") login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post("refresh") refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post("logout") logout(@Body() dto: RefreshDto) { return this.auth.logout(dto.refreshToken); }
  @Post("google") google(@Body() dto: GoogleSignInDto) { return this.auth.googleLogin(dto); }
  @Post("guest") guest() { if (process.env.NODE_ENV === "production") throw new ForbiddenException("Guest authentication is disabled"); return this.auth.guest(); }
}
