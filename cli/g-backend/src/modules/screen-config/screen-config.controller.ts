import { Controller, Get, Param, Body, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScreenConfigService } from './screen-config.service';
import { ScreenConfigEntity } from '../../entities/screen-config.entity';

@ApiTags('screen 大屏配置')
@Controller('screen')
export class ScreenConfigController {
  constructor(private readonly service: ScreenConfigService) {}

  /** 大屏清单 /api/screen/list */
  @Get('list')
  list() {
    return this.service.list();
  }

  /** 更新大屏配置 /api/screen/:key */
  @Put(':key')
  update(@Param('key') key: string, @Body() dto: Partial<ScreenConfigEntity>) {
    return this.service.update(key, dto);
  }
}
