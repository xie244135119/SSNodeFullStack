import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageDataEntity } from '../../entities/page-data.entity';
import { PageDataService } from './page-data.service';
import { PageDataController } from './page-data.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PageDataEntity])],
  providers: [PageDataService],
  controllers: [PageDataController],
  exports: [PageDataService]
})
export class PageDataModule {}
