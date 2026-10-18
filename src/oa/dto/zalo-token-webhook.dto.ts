import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Payload id.onweb.asia sends after exchanging a Zalo OA authorization code. */
export class ZaloTokenWebhookDto {
  @IsString()
  @IsNotEmpty()
  access_token: string;

  @IsString()
  @IsNotEmpty()
  refresh_token: string;

  /**
   * Zalo application ID; validated against config when present, but
   * id.onweb.asia's actual relay payload does not always include it
   * (it sends `oa_id` instead) — kept optional so that shape still validates.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  app_id?: string;

  /** Zalo OA ID returned by the token exchange; not used to find the
   * connection (state is), but forwarded to completeOAuthConnection the
   * same way the direct /callback flow does. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  oa_id?: string;

  /** OAuth state issued by Comvia when the user pressed Connect. */
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expires_in?: number;
}
