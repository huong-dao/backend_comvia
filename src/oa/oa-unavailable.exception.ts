import { BadRequestException } from '@nestjs/common';

/**
 * The OA cannot be used to send (not connected, token missing or expired).
 * Thrown before any request reaches Zalo, so the message is guaranteed unsent
 * and the caller may safely keep it queued instead of marking it uncertain.
 */
export class OaUnavailableException extends BadRequestException {}
