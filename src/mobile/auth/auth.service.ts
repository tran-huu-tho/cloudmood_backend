import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(data: any) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    // In a real app, hash password here: 
    // const hashedPassword = await bcrypt.hash(data.password, 10);
    // Note: The flutter app seems to store raw passwords according to its logic for simplicity, but we should hash it. Let's keep it compatible with existing DB if it's already in plaintext, or hash it and adapt Flutter.
    // Assuming Flutter sent raw password, we'll hash it.
    
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

    const token = this.jwtService.sign({ sub: user.id.toString(), email: user.email });
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

    const token = this.jwtService.sign({ sub: user.id.toString(), email: user.email });
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
      isCurrentPasswordCorrect = await bcrypt.compare(data.currentPassword, user.password);
    } else {
      isCurrentPasswordCorrect = user.password === data.currentPassword;
    }

    if (!isCurrentPasswordCorrect) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
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
}
