import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScreenConfigEntity } from '../../entities/screen-config.entity';
import { ScreenConfigService } from './screen-config.service';
import { ScreenConfigController } from './screen-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScreenConfigEntity])],
  providers: [ScreenConfigService],
  controllers: [ScreenConfigController],
  exports: [ScreenConfigService]
})
export class ScreenConfigModule {}
