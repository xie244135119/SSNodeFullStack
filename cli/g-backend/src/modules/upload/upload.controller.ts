import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AppConfig } from '../../config/config.interface';

@ApiTags('upload 文件上传')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly config: ConfigService<AppConfig, true>
  ) {}

  /** 上传单文件 /api/upload */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 } // 10MB,实际再按 yaml 兜底
    })
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } }
  })
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('缺少 file 字段');
    }
    const maxSize = this.config.get<AppConfig['upload']>('upload').maxSize;
    if (file.size > maxSize) {
      throw new BadRequestException(`文件超过 ${maxSize} 字节限制`);
    }
    const url = this.uploadService.save(file);
    return { url, size: file.size, filename: file.originalname };
  }
}
