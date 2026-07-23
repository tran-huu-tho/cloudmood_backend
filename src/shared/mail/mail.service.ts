import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  private getTransporter(): nodemailer.Transporter {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    return nodemailer.createTransport({
      host,
      port,
      secure: false, // true for 465, false for 587
      auth: {
        user,
        pass,
      },
    });
  }

  async sendItineraryInvite(
    toEmail: string,
    inviterName: string,
    itineraryTitle: string,
    inviteToken: string,
  ) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/itineraries/accept-invite?token=${inviteToken}`;
    const transporter = this.getTransporter();

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'Cloudmood'}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `[Cloudmood] ${inviterName} đã mời bạn chỉnh sửa chuyến đi "${itineraryTitle}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #3b82f6; text-align: center;">Lời Mời Tham Gia Chuyến Đi</h2>
          <p>Xin chào,</p>
          <p><strong>${inviterName}</strong> đã mời bạn cùng tham gia và <strong>chỉnh sửa nội dung</strong> cho chuyến đi: <strong style="color: #2563eb;">"${itineraryTitle}"</strong> trên ứng dụng Cloudmood.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${acceptUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">XÁC NHẬN THAM GIA CHUYẾN ĐÍ</a>
          </div>
          
          <p style="color: #6b7280; font-size: 13px;">Lời mời này có thời hạn trong 7 ngày. Nếu bạn không kỳ vọng nhận lời mời này, vui lòng bỏ qua email.</p>
          <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;" />
          <p style="text-align: center; color: #9ca3af; font-size: 12px;">© Cloudmood Travel Planner</p>
        </div>
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      this.logger.log(`Invite email sent to ${toEmail}: ${info.messageId}`);
      console.log(`✅ Real invite email sent successfully to ${toEmail}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${toEmail}`, error);
      console.error(`❌ Failed to send invite email to ${toEmail}:`, error.message);
      return false;
    }
  }
}
