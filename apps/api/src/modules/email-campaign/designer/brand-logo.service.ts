import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { EmailImageService } from './email-image.service';

// The client's logo: one setting (settings.logoUrl) that emails, PDFs and buyer
// pages all use. Uploaded logos live in the image library and are pinned: the
// 30-day cleanup of unused images must never remove them, because sent emails
// keep pointing at the address they went out with.

@Injectable()
export class BrandLogoService {
  constructor(
    private readonly images: EmailImageService,
    private readonly tenants: TenantService,
  ) {}

  async upload(tenantId: number, file: { buffer: Buffer; mimetype: string } | undefined): Promise<{ logoUrl: string }> {
    if (!file) throw new BadRequestException({ code: 'IMAGE_MISSING', message: 'Choose an image.' });
    const img = await this.images.upload(tenantId, file);
    return this.apply(tenantId, img.url);
  }

  async useImage(tenantId: number, imageId: number): Promise<{ logoUrl: string }> {
    const { images } = await this.images.list(tenantId);
    const img = images.find((i) => i.id === imageId);
    if (!img) throw new NotFoundException('Image not found');
    return this.apply(tenantId, img.url);
  }

  private async apply(tenantId: number, url: string): Promise<{ logoUrl: string }> {
    await this.images.pinUrl(tenantId, url);
    await this.tenants.updateSettings(tenantId, { logoUrl: url });
    return { logoUrl: url };
  }

  // Empty value, not undefined: settings are merged, so undefined would keep the old logo.
  async clear(tenantId: number): Promise<{ logoUrl: string }> {
    await this.tenants.updateSettings(tenantId, { logoUrl: '' });
    return { logoUrl: '' };
  }
}
