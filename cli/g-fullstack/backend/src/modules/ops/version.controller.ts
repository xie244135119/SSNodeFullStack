import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 版本号接口（无鉴权、无签名）。
 *
 * 用途：运维人员在服务器侧直接 curl 确认当前跑的后台版本号（排障 / 对账），
 *   不需要后台登录态、也不走大屏签名轨，故单独一个 controller、不挂任何 Guard。
 *
 * 契约：GET /api/version → { code, message, data: { version: string, name: string } }
 *   （经 TransformInterceptor 统一包装，controller 只 return data）。
 *
 * 版本定位：process.cwd()/package.json，与 BackendVersionProbe 一致——
 *   dev(nest start)cwd=backend/、prod(单文件 bundle cwd=current/release 根)
 *   package.json 都在 cwd 同级。读不到兜底返回 version='unknown'，不抛 500。
 */
@ApiTags('version 版本号')
@Controller('version')
export class VersionController {
  private readonly logger = new Logger(VersionController.name);

  @Get()
  version() {
    const pkgPath = path.join(process.cwd(), 'package.json');
    let version = 'unknown';
    let name = 'backend';
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (typeof pkg.version === 'string' && pkg.version) version = pkg.version;
        if (typeof pkg.name === 'string' && pkg.name) name = pkg.name;
      } else {
        this.logger.warn(`version 接口: 未找到 ${pkgPath}`);
      }
    } catch (e) {
      this.logger.warn(`version 接口读取失败: ${(e as Error).message}`);
    }
    return { name, version };
  }
}
