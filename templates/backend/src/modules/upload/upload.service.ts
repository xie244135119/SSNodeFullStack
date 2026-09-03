import {
  Injectable,
  BadRequestException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../../config/config.interface';

/**
 * 文件上传服务
 * 不经 DB,直接把文件写到 nginx 静态目录,返回可访问 URL
 * 见 yaml upload.storagePath / urlPrefix
 */
@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** 保存文件,返回可访问 URL */
  save(file: Express.Multer.File): string {
    const uploadCfg = this.config.get<AppConfig['upload']>('upload');
    if (!file) {
      throw new BadRequestException('缺少 file');
    }
    // 扩展名校验
    const ext = path.extname(file.originalname).toLowerCase();
    if (uploadCfg.allowedExt.length && !uploadCfg.allowedExt.includes(ext)) {
      throw new BadRequestException(`不支持的文件类型 ${ext}`);
    }
    // 大小校验(multer 已限,这里二次兜底)
    if (file.size > uploadCfg.maxSize) {
      throw new BadRequestException('文件超过大小限制');
    }

    // 确保目录存在
    const dir = path.isAbsolute(uploadCfg.storagePath)
      ? uploadCfg.storagePath
      : path.join(process.cwd(), uploadCfg.storagePath);
    const ymd = this.ymd();
    const saveDir = path.join(dir, ymd);
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // 重命名:时间戳+随机后缀防覆盖
    const base = path.basename(file.originalname, ext);
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 1e6)}_${base}${ext}`;
    const filePath = path.join(saveDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // 可访问 URL:nginx location urlPrefix -> storagePath
    return `${uploadCfg.urlPrefix}/${ymd}/${fileName}`;
  }

  /** 删除文件(按 url 反查) */
  delete(url: string) {
    if (!url) return;
    const uploadCfg = this.config.get<AppConfig['upload']>('upload');
    const prefix = uploadCfg.urlPrefix;
    if (!url.startsWith(prefix)) return;
    const rel = url.slice(prefix.length);
    const dir = path.isAbsolute(uploadCfg.storagePath)
      ? uploadCfg.storagePath
      : path.join(process.cwd(), uploadCfg.storagePath);
    const abs = path.join(dir, rel);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  }

  private ymd() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}${m}${day}`;
  }
}
