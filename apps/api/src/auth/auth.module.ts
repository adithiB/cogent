import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { AuthGuard } from './auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { LoginRateLimiterService } from './login-rate-limiter.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    AuthGuard,
    ApiKeyGuard,
    LoginRateLimiterService,
  ],
  exports: [AuthGuard, ApiKeyGuard],
})
export class AuthModule {}
