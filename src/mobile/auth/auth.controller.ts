import { Controller, Post, Get, Body, UseGuards, Put, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    try {
      return await this.authService.register(body);
    } catch (error: any) {
      console.error('Register error:', error);
      return {
        success: false,
        message: `Lỗi hệ thống: ${error.message || error}`,
      };
    }
  }

  @Post('register/send-code')
  async sendRegisterCode(@Body() body: any) {
    try {
      return await this.authService.sendRegisterCode(body.email);
    } catch (error: any) {
      console.error('Send register code error:', error);
      return {
        success: false,
        message: error.message || 'Gửi mã xác thực thất bại.',
      };
    }
  }

  @Post('register/verify-code')
  async verifyRegisterCode(@Body() body: any) {
    try {
      return await this.authService.verifyRegisterCode(body);
    } catch (error: any) {
      console.error('Verify register code error:', error);
      return {
        success: false,
        message: error.message || 'Xác thực mã thất bại.',
      };
    }
  }

  @Post('forgot-password/send-code')
  async sendForgotPasswordCode(@Body() body: any) {
    try {
      return await this.authService.sendForgotPasswordCode(body.email);
    } catch (error: any) {
      console.error('Send forgot password code error:', error);
      return {
        success: false,
        message: error.message || 'Gửi mã xác thực thất bại.',
      };
    }
  }

  @Post('forgot-password/reset')
  async resetForgotPassword(@Body() body: any) {
    try {
      return await this.authService.resetForgotPassword(body);
    } catch (error: any) {
      console.error('Reset password error:', error);
      return {
        success: false,
        message: error.message || 'Khôi phục mật khẩu thất bại.',
      };
    }
  }

  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Post('social-login')
  socialLogin(@Body() body: any) {
    return this.authService.socialLogin(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return {
      success: true,
      user: {
        ...req.user,
        id: Number(req.user.id),
      },
    };
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
