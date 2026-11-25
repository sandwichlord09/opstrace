import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  ImportsService,
  PO_IMPORTS_QUEUE,
  PoImportJobPayload,
} from './imports.service';

@Processor(PO_IMPORTS_QUEUE)
export class ImportsProcessor extends WorkerHost {
  constructor(private readonly importsService: ImportsService) {
    super();
  }

  async process(job: Job<PoImportJobPayload>): Promise<void> {
    const { importJobId, organizationId, userId, csvContent } = job.data;
    await this.importsService.processPurchaseOrderCsv(
      importJobId,
      organizationId,
      userId,
      csvContent,
    );
  }
}
