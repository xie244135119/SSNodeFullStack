import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Request,
  UseGuards,
  Headers,
  ForbiddenException
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('user 用户')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** 是否登录 /api/user/islogin(公开,自行解析 token) */
  @Get('islogin')
  isLogin(@Headers('authorization') auth?: string) {
    return this.userService.isLogin(auth);
  }

  /** 获取用户信息 /api/user/info(需登录) */
  @UseGuards(JwtAuthGuard)
  @Get('info')
  getInfo(@Request() req: any) {
    return this.userService.getInfo(req.user);
  }

  /** 退出登录 /api/user/logout */
  @Post('logout')
  logout() {
    return this.userService.logout();
  }

  // ========== 用户管理(admin-only) ==========

  private ensureAdmin(req: any) {
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      throw new ForbiddenException('仅管理员可操作用户管理');
    }
    return { id: req.user.id, username: req.user.username };
  }

  /** 列表 GET /api/user/list?page=&size=&username= */
  @UseGuards(JwtAuthGuard)
  @Get('list')
  list(
    @Query() query: { page?: string; size?: string; username?: string },
    @Request() req: any
  ) {
    this.ensureAdmin(req);
    return this.userService.list({
      page: Number(query.page) || 1,
      size: Number(query.size) || 20,
      username: query.username
    });
  }

  /** 新增 POST /api/user/create */
  @UseGuards(JwtAuthGuard)
  @Post('create')
  create(
    @Body() body: { username: string; password: string; nickname?: string; role?: string; status?: string },
    @Request() req: any
  ) {
    const operator = this.ensureAdmin(req);
    return this.userService.create(body, operator.username);
  }

  /** 修改 PUT /api/user/update */
  @UseGuards(JwtAuthGuard)
  @Put('update')
  update(
    @Body() body: { id: number; nickname?: string; role?: string; status?: string },
    @Request() req: any
  ) {
    const operator = this.ensureAdmin(req);
    return this.userService.update(body, operator);
  }

  /** 删除 DELETE /api/user/delete?id= */
  @UseGuards(JwtAuthGuard)
  @Delete('delete')
  delete(@Query('id') id: string, @Request() req: any) {
    const operator = this.ensureAdmin(req);
    return this.userService.delete(Number(id), operator);
  }

  /** 重置密码 POST /api/user/resetPassword?id= 返回新明文 */
  @UseGuards(JwtAuthGuard)
  @Post('resetPassword')
  resetPassword(@Query('id') id: string, @Request() req: any) {
    const operator = this.ensureAdmin(req);
    return this.userService.resetPassword(Number(id), operator);
  }

  /** 切换状态 POST /api/user/toggleStatus?id= */
  @UseGuards(JwtAuthGuard)
  @Post('toggleStatus')
  toggleStatus(@Query('id') id: string, @Request() req: any) {
    const operator = this.ensureAdmin(req);
    return this.userService.toggleStatus(Number(id), operator);
  }
}
