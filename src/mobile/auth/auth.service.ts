import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import axios from 'axios';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private verificationCodes = new Map<
    string,
    { code: string; expiresAt: number }
  >();

  private async sendMail(
    to: string,
    subject: string,
    text: string,
    html: string,
  ) {
    console.log(
      `\n========================================\n📧 [EMAIL SENT TO: ${to}]\nSubject: ${subject}\nContent: ${text}\n========================================\n`,
    );

    try {
      const nodemailer = require('nodemailer');

      if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log(
          'ℹ️ SMTP is not configured in .env. Real email delivery skipped.',
        );
        return;
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || 'Cloudmood'}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });
      console.log('✅ Real email sent successfully!');
    } catch (e) {
      console.warn('⚠️ Could not send real email via SMTP:', e.message);
    }
  }

  async sendRegisterCode(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.verificationCodes.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const text = `Mã xác thực đăng ký tài khoản Cloudmood của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`;
    const html = `
      <div style="background-color: #f8fafc; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Cloudmood</h1>
            <p style="margin: 4px 0 0 0; color: #38bdf8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Đăng ký tài khoản mới</p>
          </div>
          <div style="padding: 32px 24px;">
            <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">Chào bạn,</p>
            <p style="color: #475569; margin-bottom: 24px;">Cảm ơn bạn đã lựa chọn **Cloudmood**. Để hoàn tất việc đăng ký tài khoản, vui lòng sử dụng mã xác thực gồm 6 chữ số dưới đây:</p>
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; border: 1px dashed #cbd5e1; margin-bottom: 24px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; display: inline-block; margin-left: 8px;">${code}</span>
            </div>
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; color: #b45309; line-height: 1.5;">
                <strong>Lưu ý bảo mật:</strong> Mã xác thực này chỉ có hiệu lực trong vòng <strong>10 phút</strong>. Vì lý do an toàn, vui lòng tuyệt đối không chia sẻ mã này cho bất kỳ ai khác.
              </p>
            </div>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Nếu không phải bạn thực hiện yêu cầu này, vui lòng bỏ qua email này hoặc liên hệ với bộ phận hỗ trợ của chúng tôi tại <a href="mailto:support@cloudmood.com" style="color: #0f172a; text-decoration: underline; font-weight: 600;">support@cloudmood.com</a>.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} Cloudmood Inc. All rights reserved.</p>
            <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 11px;">Đây là email tự động từ hệ thống, vui lòng không trả lời trực tiếp thư này.</p>
          </div>
        </div>
      </div>
    `;

    await this.sendMail(
      normalizedEmail,
      'Mã xác thực đăng ký tài khoản Cloudmood',
      text,
      html,
    );

    return {
      success: true,
      message: 'Mã xác thực đã được gửi tới email của bạn.',
    };
  }

  async verifyRegisterCode(data: any) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const cached = this.verificationCodes.get(normalizedEmail);
    if (!cached || cached.code !== data.code || Date.now() > cached.expiresAt) {
      throw new BadRequestException(
        'Mã xác thực không hợp lệ hoặc đã hết hạn.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 8 ký tự.');
    }
    const hasUppercase = /[A-Z]/.test(data.password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(data.password);
    if (!hasUppercase) {
      throw new BadRequestException(
        'Mật khẩu phải chứa ít nhất 1 chữ viết hoa.',
      );
    }
    if (!hasSpecialChar) {
      throw new BadRequestException(
        'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: normalizedEmail,
        password: hashedPassword,
        avatar: data.avatarUrl || '/default-avatar.jpg',
        createdAt: new Date(),
        role: false,
      },
    });

    this.verificationCodes.delete(normalizedEmail);

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
    });
    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      user: {
        ...userWithoutPassword,
        id: Number(user.id),
      },
      token,
    };
  }

  async sendForgotPasswordCode(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      throw new BadRequestException('Email không tồn tại trên hệ thống.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.verificationCodes.set('reset_' + normalizedEmail, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const text = `Mã xác thực khôi phục mật khẩu Cloudmood của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`;
    const html = `
      <div style="background-color: #f8fafc; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Cloudmood</h1>
            <p style="margin: 4px 0 0 0; color: #f43f5e; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Khôi phục mật khẩu</p>
          </div>
          <div style="padding: 32px 24px;">
            <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">Chào bạn,</p>
            <p style="color: #475569; margin-bottom: 24px;">Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản **Cloudmood** của bạn. Vui lòng sử dụng mã xác thực gồm 6 chữ số dưới đây để đặt lại mật khẩu:</p>
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; border: 1px dashed #cbd5e1; margin-bottom: 24px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; display: inline-block; margin-left: 8px;">${code}</span>
            </div>
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; color: #b45309; line-height: 1.5;">
                <strong>Lưu ý bảo mật:</strong> Mã xác thực này chỉ có hiệu lực trong vòng <strong>10 phút</strong>. Vì lý do an toàn, vui lòng tuyệt đối không chia sẻ mã này cho bất kỳ ai khác.
              </p>
            </div>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Nếu không phải bạn thực hiện yêu cầu này, vui lòng bỏ qua email này hoặc liên hệ với bộ phận hỗ trợ của chúng tôi tại <a href="mailto:support@cloudmood.com" style="color: #0f172a; text-decoration: underline; font-weight: 600;">support@cloudmood.com</a>.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} Cloudmood Inc. All rights reserved.</p>
            <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 11px;">Đây là email tự động từ hệ thống, vui lòng không trả lời trực tiếp thư này.</p>
          </div>
        </div>
      </div>
    `;

    await this.sendMail(
      normalizedEmail,
      'Mã xác thực khôi phục mật khẩu Cloudmood',
      text,
      html,
    );

    return {
      success: true,
      message: 'Mã xác thực đã được gửi tới email của bạn.',
    };
  }

  async resetForgotPassword(data: any) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const cached = this.verificationCodes.get('reset_' + normalizedEmail);
    if (!cached || cached.code !== data.code || Date.now() > cached.expiresAt) {
      throw new BadRequestException(
        'Mã xác thực không hợp lệ hoặc đã hết hạn.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      throw new BadRequestException('Email không tồn tại trên hệ thống.');
    }

    if (!data.newPassword || data.newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới phải chứa ít nhất 8 ký tự.');
    }
    const hasUppercase = /[A-Z]/.test(data.newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(data.newPassword);
    if (!hasUppercase) {
      throw new BadRequestException(
        'Mật khẩu mới phải chứa ít nhất 1 chữ viết hoa.',
      );
    }
    if (!hasSpecialChar) {
      throw new BadRequestException(
        'Mật khẩu mới phải chứa ít nhất 1 ký tự đặc biệt.',
      );
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);
    await this.prisma.user.update({
      where: { email: normalizedEmail },
      data: { password: hashedNewPassword },
    });

    this.verificationCodes.delete('reset_' + normalizedEmail);

    return {
      success: true,
      message: 'Mật khẩu đã được thay đổi thành công!',
    };
  }

  async register(data: any) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 8 ký tự.');
    }
    const hasUppercase = /[A-Z]/.test(data.password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(data.password);
    if (!hasUppercase) {
      throw new BadRequestException(
        'Mật khẩu phải chứa ít nhất 1 chữ viết hoa.',
      );
    }
    if (!hasSpecialChar) {
      throw new BadRequestException(
        'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: hashedPassword,
        avatar: data.avatarUrl || '/default-avatar.jpg',
        createdAt: new Date(),
        role: false,
      },
    });

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
    });
    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      user: {
        ...userWithoutPassword,
        id: Number(user.id),
      },
      token,
    };
  }

  async login(data: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }

    let isPasswordCorrect = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isPasswordCorrect = await bcrypt.compare(data.password, user.password);
    } else {
      isPasswordCorrect = user.password === data.password;
    }

    if (!isPasswordCorrect) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
    });
    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Đăng nhập thành công!',
      user: {
        ...userWithoutPassword,
        id: Number(user.id),
      },
      token,
    };
  }

  async updateProfile(userId: string, data: any) {
    const user = await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        fullName: data.fullName,
        avatar: data.avatarUrl,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return {
      success: true,
      user: {
        ...userWithoutPassword,
        id: Number(user.id),
      },
    };
  }

  async changePassword(userId: string, data: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user) {
      throw new BadRequestException('Không tìm thấy người dùng.');
    }

    let isCurrentPasswordCorrect = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isCurrentPasswordCorrect = await bcrypt.compare(
        data.currentPassword,
        user.password,
      );
    } else {
      isCurrentPasswordCorrect = user.password === data.currentPassword;
    }

    if (!isCurrentPasswordCorrect) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }

    if (!data.newPassword || data.newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới phải chứa ít nhất 8 ký tự.');
    }
    const hasUppercase = /[A-Z]/.test(data.newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(data.newPassword);
    if (!hasUppercase) {
      throw new BadRequestException(
        'Mật khẩu mới phải chứa ít nhất 1 chữ viết hoa.',
      );
    }
    if (!hasSpecialChar) {
      throw new BadRequestException(
        'Mật khẩu mới phải chứa ít nhất 1 ký tự đặc biệt.',
      );
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { password: hashedNewPassword },
    });

    return {
      success: true,
      message: 'Đổi mật khẩu thành công!',
    };
  }

  async socialLogin(data: any) {
    let email = data.email;
    let fullName = data.fullName;
    let avatarUrl = data.avatarUrl;

    const firebaseApiKey = process.env.FIREBASE_API_KEY;

    if (data.token && !data.token.startsWith('mock-')) {
      try {
        if (data.provider === 'google.com') {
          const response = await axios.get(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${data.token}`,
          );
          email = response.data.email || email;
          fullName = response.data.name || fullName;
          avatarUrl = response.data.picture || avatarUrl;
        } else if (data.provider === 'facebook.com') {
          const response = await axios.get(
            `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${data.token}`,
          );
          email =
            response.data.email || email || `${response.data.id}@facebook.com`;
          fullName = response.data.name || fullName;
          avatarUrl = response.data.picture?.data?.url || avatarUrl;
        } else if (firebaseApiKey) {
          const response = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
            { idToken: data.token },
          );
          const firebaseUser = response.data.users?.[0];
          if (firebaseUser) {
            email = firebaseUser.email || email;
            fullName = firebaseUser.displayName || fullName;
            avatarUrl = firebaseUser.photoUrl || avatarUrl;
          } else {
            throw new UnauthorizedException('Token Firebase không hợp lệ.');
          }
        }
      } catch (error: any) {
        console.error(
          'Social token verification failed:',
          error.response?.data || error.message,
        );
        throw new UnauthorizedException(
          'Xác thực tài khoản mạng xã hội thất bại.',
        );
      }
    }

    if (!email) {
      throw new BadRequestException('Email là bắt buộc.');
    }

    // Find or create the user in our real PostgreSQL database
    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create user with a random hashed password since they log in via social OAuth
      const randomPassword = await bcrypt.hash(
        Math.random().toString(36).substring(2, 15),
        10,
      );
      user = await this.prisma.user.create({
        data: {
          fullName: fullName || 'Người dùng Google/Facebook',
          email: email,
          password: randomPassword,
          avatar: avatarUrl || '/default-avatar.jpg',
          createdAt: new Date(),
          role: false,
        },
      });
    } else {
      // Update info if it was empty or changed
      user = await this.prisma.user.update({
        where: { email },
        data: {
          fullName: user.fullName || fullName,
          avatar: user.avatar || avatarUrl || '/default-avatar.jpg',
        },
      });
    }

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
    });
    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Đăng nhập mạng xã hội thành công!',
      user: {
        ...userWithoutPassword,
        id: Number(user.id),
      },
      token,
    };
  }
}
