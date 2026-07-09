import { Controller, Post, Body, UseGuards, Put, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('profile')
  updateProfile(@Request() req, @Body() body: any) {
    return this.authService.updateProfile(req.user.id.toString(), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('password')
  changePassword(@Request() req, @Body() body: any) {
    return this.authService.changePassword(req.user.id.toString(), body);
  }
}
