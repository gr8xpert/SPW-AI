import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { TenantSettings } from '@spm/shared';
import { Tenant } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { isRecaptchaKey } from '../../common/security/recaptcha-key';

// Shared by the forms on a client's website (inquiry, favourites email,
// wishlist form): the tenant behind the widget key, the page language and
// the reCAPTCHA check.

export async function widgetTenant(tenantService: TenantService, apiKey: string): Promise<Tenant> {
  if (!apiKey) throw new UnauthorizedException('API key required');
  const tenant = await tenantService.findActiveWidgetTenantByApiKey(apiKey);
  if (!tenant) throw new UnauthorizedException('Invalid API key');
  return tenant;
}

export function language(acceptLanguage?: string): string {
  const tag = (acceptLanguage || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(tag) ? tag : 'en';
}

/**
 * A website form's reCAPTCHA, when the client set a key pair. The encrypted
 * column is authoritative; settings.recaptchaSecretKey is a pre-migration
 * legacy fallback. Only a real key pair turns the captcha on — the same rule
 * decides whether the widget shows the box (getPublicWidgetConfig), so a
 * malformed key can never demand a token the form couldn't get.
 */
export async function requireRecaptcha(tenant: Tenant, token: string | undefined): Promise<void> {
  const settings = (tenant.settings || {}) as TenantSettings;
  const secretKey = tenant.recaptchaSecretKey || settings.recaptchaSecretKey;
  if (!isRecaptchaKey(secretKey) || !isRecaptchaKey(settings.recaptchaSiteKey)) return;
  if (!token) throw new BadRequestException('reCAPTCHA verification required');
  if (!(await verifyRecaptcha(secretKey, token))) throw new BadRequestException('reCAPTCHA verification failed');
}

async function verifyRecaptcha(secretKey: string, token: string): Promise<boolean> {
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
