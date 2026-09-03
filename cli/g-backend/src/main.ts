import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, isAbsolute } from 'path';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config.interface';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const cfg = app.get(ConfigService<AppConfig>);
  const logLevel = cfg.get<AppConfig['log']>('log').level;

  const loggerLevels = new Set<string>(['log', 'error', 'warn']);
  if (logLevel === 'debug') loggerLevels.add('debug');
  app.useLogger(new Logger());

  // 全局前缀 /api(注意:静态资源目录 useStaticAssets 在前缀设置之前挂载,不受 /api 前缀影响)
  app.setGlobalPrefix(cfg.get<AppConfig['app']>('app').globalPrefix, {
    // 静态资源接口排除前缀
    exclude: ['static']
  });

  // 静态资源:托管上传文件目录,对应 yaml upload.urlPrefix(/static/uploads)
  const uploadCfg = cfg.get<AppConfig['upload']>('upload');
  const storagePath = isAbsolute(uploadCfg.storagePath)
    ? uploadCfg.storagePath
    : join(process.cwd(), uploadCfg.storagePath);
  // /static/uploads -> storagePath/uploads
  app.useStaticAssets(join(storagePath), {
    prefix: '/static/uploads/'
  });

  // 全局校验管道:拒绝多余字段,防脏字段写入
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // 请求体大小上限 2MB(文件上传走 multipart 不受此限)
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // CORS:收敛到 yaml 配置的前端来源
  const origins = cfg.get<AppConfig['app']>('app').corsOrigins;
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true
  });

  // Swagger(仅 dev)
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'develop') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('g-backend 后台服务')
      .setDescription('NestJS + SQLite + TypeORM')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = cfg.get<AppConfig['app']>('app').port || Number(process.env.PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `[backend] listening on http://localhost:${port}/${cfg.get<AppConfig['app']>('app').globalPrefix} (log=${logLevel})`
  );
  // 防止 loggerLevels 未使用告警
  void loggerLevels;
}

void bootstrap();
