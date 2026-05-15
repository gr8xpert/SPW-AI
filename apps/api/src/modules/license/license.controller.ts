import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LicenseService } from './license.service';
import { ValidateLicenseDto } from './dto';
import { Public } from '../../common/decorators';

// Per-IP throttles for the public license endpoints. The global IP bucket
// (100/min) is plenty for legitimate WP plugin polling (typically one
// validate at activation + a /config fetch every page render) but lets an
// attacker probe ~6,000 candidate keys per IP per hour. Tightening to
// 20/min + 3/s makes brute-force enumeration impractical without losing
// any real-world headroom for a single plugin install.
//
// Note on enumeration: validateLicense() returns distinct `status` values
// ('invalid' / 'revoked' / 'expired') so the WP plugin can render a useful
// dashboard message ("renew your subscription" vs "key was revoked"). This
// does mean a probe with a valid-but-revoked key can be distinguished from
// a never-existed key. We accept that trade-off because (a) it requires
// already knowing a real key, and (b) the rate limit below caps how
// usefully the distinction can be mined.
const LICENSE_VALIDATE_THROTTLE = {
  default: { limit: 20, ttl: 60_000 },
  short: { limit: 3, ttl: 1000 },
};

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
  @Throttle(LICENSE_VALIDATE_THROTTLE)
  async validateLicense(@Body() dto: ValidateLicenseDto) {
    return this.licenseService.validateLicense(dto.licenseKey, dto.domain);
  }

  /**
   * Get widget configuration for a license key
   * GET /api/v1/license/config?key=XXXX-XXXX-XXXX-XXXX
   */
  @Get('config')
  @Throttle(LICENSE_VALIDATE_THROTTLE)
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
