import { Controller, Post, Get, Body, Query, Header, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';

@ApiTags('auth 认证')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captchaService: CaptchaService
  ) {}

  /** 密码登录 /api/login */
  @Post('login')
  @Header('Content-Type', 'application/json')
  login(
    @Body() body: {
      username: string;
      password: string;
      captchaId: string;
      verifycode: string;
    },
    @Req() req: any
  ) {
    return this.authService.login(body, this.extractIp(req));
  }

  /** IP:优先 x-forwarded-for 第一段 → req.ip → socket.remoteAddress(与 throttle.guard 的 getTracker 同轨) */
  private extractIp(req: any): string {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
      return String(xff).split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || '';
  }

  /** 单点登录 /api/ssologin */
  @Get('ssologin')
  ssoLogin(@Query() query: { [key: string]: any }, @Req() req: any) {
    return this.authService.ssoLogin(query, this.extractIp(req));
  }

  /**
   * 验证码 /api/user/captcha
   * 返回 { captchaId, svg } svg 为 svg-captcha 生成的 SVG 字符串
   * 前端直接 innerHTML 渲染,登录时带 captchaId + verifycode
   */
  @Get('user/captcha')
  captcha() {
    const { captchaId, svg } = this.captchaService.generate();
    return { captchaId, svg };
  }
}
