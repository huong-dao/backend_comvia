import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express'; // Import thêm dòng này
import { join } from 'path'; // Import thêm dòng này
import { AppModule } from './app.module';

async function bootstrap() {
  // const app = await NestFactory.create(AppModule);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // --- THÊM DÒNG NÀY ĐỂ PUBLIC THƯ MỤC ẢNH ---
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/public/', // URL sẽ là http://localhost:3000/public/qrcodes/file.png
  });
  // ------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3002', // FE Next hiện tại
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-workspace-id',
    ],
    credentials: false, // bạn dùng JWT bearer, không dùng cookie
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
