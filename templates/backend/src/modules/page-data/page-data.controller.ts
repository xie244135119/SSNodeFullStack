import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Request,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PageDataService } from './page-data.service';

@ApiTags('page-data 大屏页面数据')
@Controller()
export class PageDataController {
  constructor(private readonly service: PageDataService) {}

  /** 列表 /api/getList */
  @Get('getList')
  getList(@Query() query: any) {
    return this.service.getList(query);
  }

  /** 新增 /api/add */
  @Post('add')
  add(@Body() body: any, @Request() req: any) {
    return this.service.add(body, req.user);
  }

  /** 修改 /api/edit */
  @Put('edit')
  edit(@Body() body: any) {
    return this.service.update(body);
  }

  /** 删除 /api/deleteById */
  @Delete('deleteById')
  deleteById(@Query('id') id: string) {
    return this.service.deleteById(Number(id));
  }

  /** 导入文件 /api/v1/import */
  @Post('v1/import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } }
  })
  import(@UploadedFile() file: any) {
    if (!file) {
      throw new Error('缺少 file');
    }
    return { filename: file.originalname };
  }
}
