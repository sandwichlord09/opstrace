import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  AttachmentDto,
  AuditAction,
  DownloadAttachmentUrlDto,
  PresignAttachmentResponseDto,
  RelatedRecordType,
} from '@opstrace/shared-types';
import { PresignAttachmentInput } from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

const PRESIGN_EXPIRES_SECONDS = 300;

@Injectable()
export class AttachmentsService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly configService: ConfigService,
  ) {
    const endpointHost = this.configService.get<string>('S3_ENDPOINT', 'localhost');
    const endpointPort = this.configService.get<string>('S3_PORT', '9000');
    const useSsl = this.configService.get<string>('S3_USE_SSL', 'false') === 'true';
    const protocol = useSsl ? 'https' : 'http';
    const endpoint = endpointHost.startsWith('http')
      ? endpointHost
      : `${protocol}://${endpointHost}:${endpointPort}`;

    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY') || 'seaweedfs';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_KEY') || 'seaweedfs';

    this.bucketName = this.configService.get<string>(
      'S3_BUCKET_EVIDENCE',
      'opstrace-evidence',
    );

    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true, // Required for SeaweedFS / MinIO local S3 compatibility
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Generate a presigned S3 PUT URL for uploading photographic evidence.
   *
   * SECURITY & ISOLATION:
   * - Verifies that `relatedRecordId` belongs to `organizationId` before issuing
   *   a storage key or database record.
   * - Generates a server-controlled object key `{organizationId}/{entityType}/{entityId}/{uuid}`
   *   so unsafe client filenames are never used as S3 paths.
   */
  async presignUpload(
    input: PresignAttachmentInput,
  ): Promise<PresignAttachmentResponseDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.assertRelatedRecordBelongsToTenant(
      organizationId,
      input.relatedRecordType,
      input.relatedRecordId,
    );

    const storageKey = `${organizationId}/${input.relatedRecordType}/${input.relatedRecordId}/${randomUUID()}`;

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          organizationId,
          uploadedBy: userId,
          relatedRecordType: input.relatedRecordType,
          relatedRecordId: input.relatedRecordId,
          storageKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.CREATE,
          entityType: 'Attachment',
          entityId: created.id,
          metadata: {
            relatedRecordType: input.relatedRecordType,
            relatedRecordId: input.relatedRecordId,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
          },
        },
      });

      return created;
    });

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: input.mimeType,
      ContentLength: input.fileSize,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    return {
      attachment: this.mapToDto(attachment),
      uploadUrl,
      expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
    };
  }

  /**
   * Generate a short-lived presigned S3 GET URL for viewing an evidence photo.
   *
   * MULTI-TENANCY: Queries `attachments` scoped by `organizationId` from
   * TenantContext so Org A can never obtain a download URL for Org B's evidence.
   */
  async getDownloadUrl(id: string): Promise<DownloadAttachmentUrlDto> {
    const { organizationId } = this.tenantContext.getOrFail();

    const attachment = await this.prisma.attachment.findFirst({
      where: { id, organizationId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment "${id}" not found.`);
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: attachment.storageKey,
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    return {
      attachmentId: attachment.id,
      downloadUrl,
      expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertRelatedRecordBelongsToTenant(
    organizationId: string,
    relatedRecordType: string,
    relatedRecordId: string,
  ): Promise<void> {
    let record: { id: string } | null = null;

    if (relatedRecordType === RelatedRecordType.GOODS_RECEIPT) {
      record = await this.prisma.goodsReceipt.findFirst({
        where: { id: relatedRecordId, organizationId },
        select: { id: true },
      });
    } else if (relatedRecordType === RelatedRecordType.STOCK_INSPECTION) {
      record = await this.prisma.stockInspection.findFirst({
        where: { id: relatedRecordId, organizationId },
        select: { id: true },
      });
    } else if (relatedRecordType === RelatedRecordType.EXCEPTION) {
      record = await this.prisma.exception.findFirst({
        where: { id: relatedRecordId, organizationId },
        select: { id: true },
      });
    } else if (relatedRecordType === RelatedRecordType.PURCHASE_ORDER) {
      record = await this.prisma.purchaseOrder.findFirst({
        where: { id: relatedRecordId, organizationId },
        select: { id: true },
      });
    }

    if (!record) {
      throw new NotFoundException(
        `${relatedRecordType} "${relatedRecordId}" not found in your organization.`,
      );
    }
  }

  private mapToDto(row: {
    id: string;
    organizationId: string;
    uploadedBy: string;
    relatedRecordType: string;
    relatedRecordId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date;
  }): AttachmentDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      uploadedBy: row.uploadedBy,
      relatedRecordType: row.relatedRecordType,
      relatedRecordId: row.relatedRecordId,
      storageKey: row.storageKey,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      createdAt: row.createdAt,
    };
  }
}
