import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Routes are served under /api/* — this is what makes the refresh cookie's
  // `Path=/api/auth` (cookies.ts) actually match real request paths.
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Explicit origin allow-list, not a wildcard — required for credentialed
  // (cookie-bearing) cross-origin requests, and part of ADR-0001 §1d's CSRF
  // reasoning: CORS is a control, not an afterthought.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
