import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from '../../entities/image.entity';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';
import { UploadModule } from '../upload/upload.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity]), UploadModule, AuditModule],
  controllers: [ImageController],
  providers: [ImageService]
})
export class ImageModule {}
