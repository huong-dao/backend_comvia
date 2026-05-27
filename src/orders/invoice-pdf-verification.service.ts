import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BillingType, InvoiceStatus, Prisma } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { GeminiInvoicePdfService } from '../integrations/gemini/gemini-invoice-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_ALREADY_ISSUED_CODE,
  INVOICE_CANCELLED_CODE,
  INVOICE_INVALID_STATUS_CODE,
  INVOICE_PDF_MAX_BYTES,
  INVOICE_PDF_VERIFICATION_FAILED_CODE,
} from './invoice-pdf-verification.constants';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import type {
  BillingSnapshotJson,
  ExtractedInvoicePdfData,
  InvoiceVerificationJson,
  VerifyIssueInvoicePdfFailureResponse,
  VerifyIssueInvoicePdfSuccessResponse,
} from './invoice-pdf-verification.types';
import type { UploadedInvoicePdfFile } from './invoice-pdf-verification.types';
import {
  buildInvoicePdfMismatches,
  parseIsoDateOnly,
} from './invoice-pdf-verification.util';

@Injectable()
export class InvoicePdfVerificationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly geminiInvoicePdfService: GeminiInvoicePdfService,
    private readonly invoicePdfStorageService: InvoicePdfStorageService,
  ) {}

  async verifyAndIssueInvoicePdf(params: {
    invoiceId: string;
    actorUserId: string;
    file: UploadedInvoicePdfFile;
    invoiceNumber?: string;
    issueDate?: string;
    idempotencyKey?: string;
  }): Promise<
    VerifyIssueInvoicePdfSuccessResponse | VerifyIssueInvoicePdfFailureResponse
  > {
    this.assertValidPdfUpload(params.file);

    const invoice = await this.prismaService.invoice.findUnique({
      where: { id: params.invoiceId },
      include: {
        items: true,
        order: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    this.assertInvoiceStatusForIssue(invoice.status);

    const billingSnapshot = (invoice.billingSnapshotJson ??
      {}) as BillingSnapshotJson;
    const amountExclVat = Number(invoice.order.totalAmountExclVat);
    const vatAmount = Number(invoice.order.totalVatAmount);
    const amountInclVat = Number(invoice.order.totalAmountInclVat);
    const vatRate = Number(invoice.items[0]?.vatRate ?? 10);
    const fileSha256 = this.invoicePdfStorageService.sha256Hex(params.file.buffer);

    const demoFallback: ExtractedInvoicePdfData = {
      invoiceNumber: params.invoiceNumber ?? invoice.invoiceNumber ?? 'DEMO-INV-001',
      issueDate: parseIsoDateOnly(params.issueDate) ?? new Date().toISOString().slice(0, 10),
      billingType:
        invoice.billingType === BillingType.ORGANIZATION
          ? 'organization'
          : 'individual',
      companyName: billingSnapshot.companyName ?? null,
      taxCode: billingSnapshot.taxCode ?? null,
      address: billingSnapshot.address ?? null,
      invoiceEmail: billingSnapshot.invoiceEmail ?? null,
      representativeName: billingSnapshot.representativeName ?? null,
      phone: billingSnapshot.phone ?? null,
      fullName: billingSnapshot.fullName ?? null,
      citizenId: billingSnapshot.citizenId ?? null,
      lineItemName: invoice.items[0]?.name ?? 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
      vatRatePercent: vatRate,
      amountExclVat,
      vatAmount,
      amountInclVat,
    };

    const extracted = await this.geminiInvoicePdfService.extractInvoiceData(
      params.file.buffer,
      demoFallback,
    );

    const mismatches = buildInvoicePdfMismatches({
      billingType: invoice.billingType,
      billingSnapshot,
      extracted,
      amountExclVat,
      vatAmount,
      amountInclVat,
      vatRate,
      submittedInvoiceNumber: params.invoiceNumber,
      submittedIssueDate: params.issueDate,
    });

    const verificationBase: Omit<InvoiceVerificationJson, 'result' | 'mismatches'> =
      {
        idempotencyKey: params.idempotencyKey ?? null,
        verifiedAt: new Date().toISOString(),
        model: this.geminiInvoicePdfService.getModelName(),
        promptVersion: this.geminiInvoicePdfService.getPromptVersion(),
        fileSha256,
        fileSizeBytes: params.file.size,
        actorUserId: params.actorUserId,
        extracted,
        submittedInvoiceNumber: params.invoiceNumber ?? null,
        submittedIssueDate: params.issueDate ?? null,
      };

    if (mismatches.length > 0) {
      const verificationJson: InvoiceVerificationJson = {
        ...verificationBase,
        result: 'fail',
        mismatches,
      };

      await this.prismaService.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            verificationJson: verificationJson as unknown as Prisma.InputJsonValue,
          },
        });

        await this.auditLogService.write({
          actorUserId: params.actorUserId,
          workspaceId: invoice.workspaceId,
          action: AUDIT_ACTIONS.INVOICE_PDF_VERIFICATION_FAILED,
          resourceType: AUDIT_RESOURCE_TYPES.INVOICE,
          resourceId: invoice.id,
          metadataJson: {
            result: 'fail',
            code: INVOICE_PDF_VERIFICATION_FAILED_CODE,
            mismatchCount: mismatches.length,
            fileSha256,
            fileSizeBytes: params.file.size,
          },
          tx,
        });
      });

      throw new UnprocessableEntityException({
        ok: false,
        code: INVOICE_PDF_VERIFICATION_FAILED_CODE,
        invoiceId: invoice.id,
        mismatches,
        extractedPreview: extracted,
        message: 'Vui lòng kiểm tra file PDF và thử upload lại.',
      } satisfies VerifyIssueInvoicePdfFailureResponse);
    }

    const pdfUrl = await this.invoicePdfStorageService.saveInvoicePdf(
      invoice.id,
      params.file.buffer,
    );

    const resolvedInvoiceNumber =
      params.invoiceNumber?.trim() ||
      extracted.invoiceNumber?.trim() ||
      invoice.invoiceNumber ||
      null;
    const resolvedIssueDate =
      parseIsoDateOnly(params.issueDate) ||
      parseIsoDateOnly(extracted.issueDate) ||
      new Date().toISOString().slice(0, 10);

    const verificationJson: InvoiceVerificationJson = {
      ...verificationBase,
      result: 'pass',
      mismatches: [],
    };

    const updated = await this.prismaService.$transaction(async (tx) => {
      const issued = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.ISSUED,
          invoiceNumber: resolvedInvoiceNumber,
          issueDate: new Date(`${resolvedIssueDate}T00:00:00.000Z`),
          invoicePdfUrl: pdfUrl,
          verificationJson: verificationJson as unknown as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          issueDate: true,
          invoicePdfUrl: true,
        },
      });

      await this.auditLogService.write({
        actorUserId: params.actorUserId,
        workspaceId: invoice.workspaceId,
        action: AUDIT_ACTIONS.INVOICE_ISSUED_VIA_PDF,
        resourceType: AUDIT_RESOURCE_TYPES.INVOICE,
        resourceId: invoice.id,
        metadataJson: {
          result: 'pass',
          invoiceNumber: resolvedInvoiceNumber,
          issueDate: resolvedIssueDate,
          fileSha256,
          fileSizeBytes: params.file.size,
          model: verificationJson.model,
          promptVersion: verificationJson.promptVersion,
        },
        tx,
      });

      return issued;
    });

    return {
      ok: true,
      invoice: {
        id: updated.id,
        status: 'ISSUED',
        invoiceNumber: updated.invoiceNumber,
        issueDate: updated.issueDate?.toISOString() ?? null,
        invoicePdfUrl: updated.invoicePdfUrl,
      },
    };
  }

  private assertValidPdfUpload(file: UploadedInvoicePdfFile) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only application/pdf files are allowed');
    }
    if (file.size <= 0 || file.size > INVOICE_PDF_MAX_BYTES) {
      throw new BadRequestException(
        `PDF file size must be between 1 byte and ${INVOICE_PDF_MAX_BYTES} bytes`,
      );
    }
    const header = file.buffer.subarray(0, 4).toString('utf8');
    if (!header.startsWith('%PDF')) {
      throw new BadRequestException('Invalid PDF file content');
    }
  }

  private assertInvoiceStatusForIssue(status: InvoiceStatus) {
    if (status === InvoiceStatus.ISSUED) {
      throw new ConflictException({
        ok: false,
        code: INVOICE_ALREADY_ISSUED_CODE,
        message: 'Invoice is already issued',
      });
    }
    if (status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException({
        ok: false,
        code: INVOICE_CANCELLED_CODE,
        message: 'Invoice is cancelled',
      });
    }
    if (status !== InvoiceStatus.POSTED) {
      throw new BadRequestException({
        ok: false,
        code: INVOICE_INVALID_STATUS_CODE,
        message: 'Invoice is not in POSTED status',
      });
    }
  }
}