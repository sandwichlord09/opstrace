import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { AuditAction, RelatedRecordType } from '@opstrace/shared-types';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('http://localhost:9000/opstrace-evidence/signed-url'),
}));

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const grId = '66666666-6666-6666-6666-666666666666';
  const attachmentId = '77777777-7777-7777-7777-777777777777';

  let mockTx: {
    attachment: { create: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    goodsReceipt: { findFirst: jest.Mock };
    stockInspection: { findFirst: jest.Mock };
    exception: { findFirst: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock };
    attachment: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      attachment: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: attachmentId,
          ...data,
          createdAt: new Date(),
        })),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      goodsReceipt: { findFirst: jest.fn().mockResolvedValue({ id: grId }) },
      stockInspection: { findFirst: jest.fn().mockResolvedValue(null) },
      exception: { findFirst: jest.fn().mockResolvedValue(null) },
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      attachment: {
        findFirst: jest.fn().mockResolvedValue({
          id: attachmentId,
          organizationId: orgA,
          storageKey: `${orgA}/GOODS_RECEIPT/${grId}/file-uuid`,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
          },
        },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'worker@opstrace.local',
        roles: ['WAREHOUSE_EMPLOYEE'],
        permissions: ['receipt:submit', 'exception:view'],
      },
      fn,
    );

  it('creates tenant-scoped storageKey, persists attachment + auditLog, and returns presigned PUT URL', async () => {
    const result = await runAsOrgA(() =>
      service.presignUpload({
        relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
        relatedRecordId: grId,
        fileName: '../../unsafe-name.jpg',
        mimeType: 'image/jpeg',
        fileSize: 204800,
      }),
    );

    expect(result.uploadUrl).toContain('http://localhost:9000');
    expect(result.expiresInSeconds).toBe(300);
    expect(result.attachment.storageKey).toMatch(
      new RegExp(`^${orgA}/GOODS_RECEIPT/${grId}/[0-9a-f-]+$`),
    );
    expect(result.attachment.storageKey).not.toContain('unsafe-name');
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: 'Attachment',
        }),
      }),
    );
  });

  it('rejects presignUpload when related record belongs to another organization', async () => {
    mockPrisma.goodsReceipt.findFirst.mockResolvedValue(null);

    await expect(
      runAsOrgA(() =>
        service.presignUpload({
          relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
          relatedRecordId: grId,
          fileName: 'photo.png',
          mimeType: 'image/png',
          fileSize: 1024,
        }),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(mockTx.attachment.create).not.toHaveBeenCalled();
  });

  it('returns presigned GET download URL for attachment owned by active tenant', async () => {
    const res = await runAsOrgA(() => service.getDownloadUrl(attachmentId));

    expect(res.attachmentId).toBe(attachmentId);
    expect(res.downloadUrl).toContain('http://localhost:9000');
    expect(mockPrisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: attachmentId, organizationId: orgA },
    });
  });

  it('rejects cross-tenant attachment download URL requests with NotFoundException', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    await expect(
      runAsOrgA(() => service.getDownloadUrl(attachmentId)),
    ).rejects.toThrow(NotFoundException);
  });
});
