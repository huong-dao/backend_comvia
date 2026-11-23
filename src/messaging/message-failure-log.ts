import { HttpException, Logger } from '@nestjs/common';
import { MessageStatus, Prisma, SendType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toSendErrorBody } from './send-error-messages';

const logger = new Logger('MessageFailureLog');

/** MessageLog.errorCode is VARCHAR(255) in practice; keep the reason within it. */
const ERROR_CODE_MAX_LENGTH = 255;

/**
 * Stable, greppable failure reason: `<SEND_ERROR_CODE>: <detail or message>`,
 * e.g. `OA_NOT_CONNECTED: Official Account chưa kết nối...` or
 * `ZALO_REJECTED: <raw Zalo text>`. Works for any thrown value.
 */
export function failureReasonFromError(
  error: unknown,
  maxLength = ERROR_CODE_MAX_LENGTH,
): string {
  const body = toSendErrorBody(error);
  return `${body.code}: ${body.detail ?? body.message}`.slice(0, maxLength);
}

/** Attach the failed MessageLog id to an HttpException without changing its status. */
export function withMessageLogId(
  error: unknown,
  messageLogId: string | undefined,
): unknown {
  if (!messageLogId || !(error instanceof HttpException)) return error;
  const response = error.getResponse();
  const body =
    typeof response === 'object' && response !== null
      ? response
      : { message: response };
  return new HttpException({ ...body, messageLogId }, error.getStatus());
}

export type FailedMessageInput = {
  workspaceId: string;
  oaConnectionId: string;
  templateId: string;
  sendType: SendType;
  phoneNumber: string;
  payloadSnapshot: Prisma.InputJsonValue;
  error: unknown;
  operatorUserId?: string | null;
  costAtTime?: number;
  /** FAILED = Zalo/we rejected it. PENDING = outcome unknown (needs reconciliation). */
  status?: Extract<MessageStatus, 'FAILED' | 'PENDING'>;
};

/**
 * Persists one MessageLog per failed send attempt with its reason and the
 * attempt time (`sentAt`). Never throws: a failure to write the log must not
 * mask the original send error. Returns the log id, or undefined if the write failed.
 */
export async function recordFailedMessage(
  prisma: Pick<PrismaService, 'messageLog'>,
  input: FailedMessageInput,
): Promise<string | undefined> {
  try {
    const log = await prisma.messageLog.create({
      data: {
        workspaceId: input.workspaceId,
        oaConnectionId: input.oaConnectionId,
        templateId: input.templateId,
        sendType: input.sendType,
        phoneNumber: input.phoneNumber,
        payloadSnapshot: input.payloadSnapshot,
        status: input.status ?? 'FAILED',
        errorCode: failureReasonFromError(input.error),
        ...(input.costAtTime !== undefined
          ? { costAtTime: input.costAtTime }
          : {}),
        operatorUserId: input.operatorUserId ?? null,
        sentAt: new Date(),
      },
    });
    return log.id;
  } catch (writeError) {
    logger.error(
      `Could not persist failed MessageLog for ${input.phoneNumber}: ${
        writeError instanceof Error ? writeError.message : String(writeError)
      }`,
    );
    return undefined;
  }
}
