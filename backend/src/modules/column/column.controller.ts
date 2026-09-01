import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ColumnService } from './column.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppSignGuard } from '../../common/app-sign.guard';

@ApiTags('column 栏目展示')
@Controller('column')
export class ColumnController {
  constructor(private readonly service: ColumnService) {}

  /** 列表(后台) /api/column/list */
  @Get('list')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(
    @Query() query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      category?: string;
      orderBy?: string;
      order?: 'ASC' | 'DESC';
    }
  ) {
    return this.service.list(query);
  }

  /** 大屏消费列表 /api/column/screen(大屏签名,无 token) */
  @Get('screen')
  @UseGuards(AppSignGuard)
  screenList() {
    return this.service.screenList();
  }

  /** 详情 /api/column/:id */
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  /** 新增 /api/column */
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  /** 修改 /api/column/:id */
  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  /** 删除 /api/column/:id */
  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
