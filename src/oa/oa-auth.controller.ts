import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { OaConnectionsService } from './oa-connections.service';

@Controller('oa/auth')
export class OaAuthController {
  constructor(
    private readonly oaConnectionsService: OaConnectionsService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('oa_id') oaId: string | undefined,
    @Res() res: Response,
  ) {
    const fallbackUrl =
      'https://app.comvia.cloud/settings/oa?connected=1';
    const successRedirectUrl =
      this.configService.get<string>('zalo.oauthSuccessRedirectUrl') ??
      fallbackUrl;

    try {
      await this.oaConnectionsService.handleOAuthCallback({
        code,
        state,
        oa_id: oaId,
      });

      const redirectUrl = new URL(successRedirectUrl);
      redirectUrl.searchParams.set('status', 'success');
      return res.redirect(redirectUrl.toString());
    } catch {
      const redirectUrl = new URL(successRedirectUrl);
      redirectUrl.searchParams.set('status', 'error');
      return res.redirect(redirectUrl.toString());
    }
  }
}
