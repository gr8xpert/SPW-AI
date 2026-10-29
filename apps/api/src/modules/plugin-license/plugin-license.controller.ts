import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { PluginLicenseRequestDto, PluginTranslateDto } from './dto/plugin-license.dto';
import { PluginLicenseService } from './plugin-license.service';
import { PluginTranslateService } from './plugin-translate.service';

// Public licence API for SPM's WordPress plugins. Separate from /api/v1/license (the SPM widget's
// licence endpoints) so the two never interfere. Per-IP throttles keep key guessing impractical,
// as in LicenseController; translate allows more because one page sends one call per batch.
const KEY_THROTTLE = { default: { limit: 20, ttl: 60_000 }, short: { limit: 3, ttl: 1000 } };
const TRANSLATE_THROTTLE = { default: { limit: 120, ttl: 60_000 }, short: { limit: 5, ttl: 1000 } };

@Controller('api/v1/plugin-license')
@Public()
export class PluginLicenseController {
  constructor(
    private readonly licenses: PluginLicenseService,
    private readonly translator: PluginTranslateService,
  ) {}

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @Throttle(KEY_THROTTLE)
  activate(@Body() dto: PluginLicenseRequestDto) {
    return this.licenses.activate(dto.license_key, dto.site_url, dto.plugin_version);
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @Throttle(KEY_THROTTLE)
  deactivate(@Body() dto: PluginLicenseRequestDto) {
    return this.licenses.deactivate(dto.license_key, dto.site_url);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle(KEY_THROTTLE)
  check(@Body() dto: PluginLicenseRequestDto) {
    return this.licenses.check(dto.license_key, dto.site_url, dto.plugin_version);
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  @Throttle(KEY_THROTTLE)
  update(@Body() dto: PluginLicenseRequestDto) {
    return this.licenses.updateInfo(dto.license_key, dto.site_url, dto.plugin_version ?? '0');
  }

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @Throttle(TRANSLATE_THROTTLE)
  translate(@Body() dto: PluginTranslateDto) {
    return this.translator.translate(dto);
  }

  // Signed, 10-minute link from /update; WordPress downloads the zip from here.
  @Get('download')
  @Throttle(KEY_THROTTLE)
  async download(@Query('t') token: string, @Res() res: Response) {
    const file = await this.licenses.resolveDownload(token);
    res.download(file.path, file.filename);
  }
}
