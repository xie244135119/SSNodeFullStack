import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColumnItemEntity } from '../../entities/column-item.entity';
import { ColumnImageEntity } from '../../entities/column-image.entity';
import { ColumnService } from './column.service';
import { ColumnController } from './column.controller';
import { AppSignModule } from '../../common/app-sign.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ColumnItemEntity, ColumnImageEntity]),
    AppSignModule
  ],
  providers: [ColumnService],
  controllers: [ColumnController],
  exports: [ColumnService]
})
export class ColumnModule {}
