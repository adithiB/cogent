import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { AuthGuard, type RequestWithScope } from './auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { signupSchema, type SignupDto } from './dto/signup.dto';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { REFRESH_COOKIE } from './cookies';
import { OrgsRepository } from '../db/repositories/orgs.repository';
import { UsersRepository } from '../db/repositories/users.repository';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokensService,
    private readonly orgs: OrgsRepository,
    private readonly users: UsersRepository,
  ) {}

  @Post('signup')
  signup(
    @Body(new ZodValidationPipe(signupSchema)) dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.signup(dto, res);
  }

  @Post('login')
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, req.ip ?? 'unknown', res);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (
      req.cookies as Record<string, string | undefined> | undefined
    )?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('No refresh token present.');
    }
    await this.tokens.refreshSession(res, token);
    return { refreshed: true };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (
      req.cookies as Record<string, string | undefined> | undefined
    )?.[REFRESH_COOKIE];
    await this.tokens.endSession(res, token);
    return { authenticated: false };
  }

  @UseGuards(AuthGuard)
  @Get('session')
  async session(@Req() req: Request) {
    const { scope } = req as RequestWithScope;
    const [org, user] = await Promise.all([
      this.orgs.getScoped(scope),
      this.users.findById(scope.userId),
    ]);
    return {
      authenticated: true,
      org: { name: org?.name },
      user: { email: user?.email },
      role: scope.role,
    };
  }
}
