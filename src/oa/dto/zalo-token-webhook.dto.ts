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

  /** Zalo application ID; it is validated, not used to find an OA connection. */
  @IsString()
  @IsNotEmpty()
  app_id: string;

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
