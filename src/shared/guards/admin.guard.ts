import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Check if user is authenticated and has the role attribute set to true (admin)
    if (!user || user.role !== true) {
      throw new ForbiddenException('Bạn không có quyền truy cập chức năng này.');
    }
    return true;
  }
}
