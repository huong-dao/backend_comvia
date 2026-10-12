import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import {
  extractHttpExceptionMessage,
  resolveOaOAuthRedirectUrl,
} from './oa-oauth-redirect.util';
import { OaConnectionsService } from './oa-connections.service';
import { ZaloTokenWebhookDto } from './dto/zalo-token-webhook.dto';

@Controller('oa/auth')
export class OaAuthController {
  constructor(
    private readonly oaConnectionsService: OaConnectionsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Internal relay from id.onweb.asia after it exchanges the Zalo OAuth code.
   * The OAuth state, not app_id, identifies the pending Comvia OA connection.
   */
  @Public()
  @Post('token-webhook')
  @HttpCode(HttpStatus.OK)
  async tokenWebhook(
    @Body() dto: ZaloTokenWebhookDto,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertWebhookAuthorized(authorization);

    const configuredAppId = this.configService.getOrThrow<string>('zalo.appId');
    if (dto.app_id !== configuredAppId) {
      throw new BadRequestException('Unexpected Zalo app_id');
    }

    await this.oaConnectionsService.handleTokenWebhook(dto);
    return { ok: true };
  }

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
          workspaceId: updated.workspaceOa.workspaceId,
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

  private assertWebhookAuthorized(authorization?: string) {
    const configuredToken = this.configService.getOrThrow<string>(
      'zalo.oauthWebhookToken',
    );
    const token = authorization?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      throw new UnauthorizedException('Invalid OAuth webhook authorization');
    }

    const expected = Buffer.from(configuredToken);
    const received = Buffer.from(token);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException('Invalid OAuth webhook authorization');
    }
  }
}
