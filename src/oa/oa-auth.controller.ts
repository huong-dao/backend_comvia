import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import {
  extractHttpExceptionMessage,
  resolveOaOAuthRedirectUrl,
} from './oa-oauth-redirect.util';
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
    const appBaseUrl =
      this.configService.get<string>('zalo.comviaAppBaseUrl') ??
      'https://app.comvia.cloud';
    const fallbackRedirectUrl =
      this.configService.get<string>('zalo.oauthSuccessRedirectUrl') ??
      `${appBaseUrl}/app/settings/oa`;

    try {
      const updated = await this.oaConnectionsService.handleOAuthCallback({
        code,
        state,
        oa_id: oaId,
      });

      return res.redirect(
        resolveOaOAuthRedirectUrl({
          appBaseUrl,
          fallbackRedirectUrl,
          workspaceId: updated.workspaceId,
          status: 'success',
        }),
      );
    } catch (error) {
      const workspaceId =
        await this.oaConnectionsService.resolveWorkspaceIdByOAuthState(state);

      return res.redirect(
        resolveOaOAuthRedirectUrl({
          appBaseUrl,
          fallbackRedirectUrl,
          workspaceId,
          status: 'error',
          message: extractHttpExceptionMessage(error),
        }),
      );
    }
  }
}
