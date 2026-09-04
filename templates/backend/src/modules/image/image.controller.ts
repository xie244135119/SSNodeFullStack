import { Controller, Get, Post, Put, Delete, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImageService } from './image.service';

/**
 * 图片管理(后台,走 JWT)
 * 前端流程:先调 /api/upload 上传拿 url,再 POST /api/image/add 登记;
 * 删除时后端同步删物理文件。
 */
@ApiTags('image 图片管理')
@UseGuards(JwtAuthGuard)
@Controller('image')
export class ImageController {
  constructor(private readonly service: ImageService) {}

  /** 列表 /api/image/getList */
  @Get('getList')
  getList(@Query() query: { name?: string; page?: string; pageSize?: string }) {
    return this.service.getList(query);
  }

  /** 新增登记 /api/image/add */
  @Post('add')
  add(@Body() body: { name: string; url: string; size?: number }, @Request() req: any) {
    return this.service.add(body, { username: req?.user?.username || '' });
  }

  /** 改名 /api/image/edit */
  @Put('edit')
  edit(@Body() body: { id: number; name: string }, @Request() req: any) {
    return this.service.update(body, { username: req?.user?.username || '' });
  }

  /** 删除(记录 + 物理文件) /api/image/deleteById */
  @Delete('deleteById')
  deleteById(@Query('id') id: string, @Request() req: any) {
    return this.service.deleteById(Number(id), { username: req?.user?.username || '' });
  }
}
