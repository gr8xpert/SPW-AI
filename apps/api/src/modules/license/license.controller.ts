import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LicenseService } from './license.service';
import { ValidateLicenseDto } from './dto';
import { Public } from '../../common/decorators';

@Controller('api/v1/license')
@Public() // These endpoints are public for WP plugin access
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /**
   * Validate a license key
   * POST /api/v1/license/validate
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateLicense(@Body() dto: ValidateLicenseDto) {
    return this.licenseService.validateLicense(dto.licenseKey, dto.domain);
  }

  /**
   * Get widget configuration for a license key
   * GET /api/v1/license/config?key=XXXX-XXXX-XXXX-XXXX
   */
  @Get('config')
  async getConfig(@Query('key') licenseKey: string) {
    return this.licenseService.getWidgetConfig(licenseKey);
  }

  /**
   * Health check / ping endpoint
   * GET /api/v1/license/ping
   */
  @Get('ping')
  @HttpCode(HttpStatus.OK)
  ping() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    };
  }
}
