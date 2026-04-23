/**
 * Idempotent demo-data seed — populates every dashboard page with realistic
 * test data so the UI is immediately explorable after a fresh Docker deploy.
 *
 * Depends on the base seed (seed.ts) having already created Plans and the
 * super-admin / platform tenant.
 *
 * Usage (inside Docker):
 *   docker compose -f docker-compose.prod.yml -f docker-compose.local-test.yml \
 *     --env-file .env.docker-local exec api node dist/database/seed-demo-data.js
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import dataSource from '../config/database.config';
import { generateApiKey } from '../common/crypto/api-key';
import { Plan } from './entities/plan.entity';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { Location } from './entities/location.entity';
import { PropertyType } from './entities/property-type.entity';
import { Feature } from './entities/feature.entity';
import { Property } from './entities/property.entity';
import { Contact } from './entities/contact.entity';
import { Lead, LeadActivity } from './entities/lead.entity';
import { Ticket, TicketMessage } from './entities/ticket.entity';
import { Label } from './entities/label.entity';
import { PropertyView, SearchLog } from './entities/analytics.entity';
import { LicenseKey } from './entities/license-key.entity';
import { CreditBalance } from './entities/credit-balance.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { EmailTemplate, EmailCampaign } from './entities/email-campaign.entity';
import { UserRole } from '@spw/shared';

const DEMO_TENANT_SLUG = 'costa-sol-realty';

async function seedDemoTenant(ds: DataSource): Promise<Tenant> {
  const repo = ds.getRepository(Tenant);
  const existing = await repo.findOne({ where: { slug: DEMO_TENANT_SLUG } });
  if (existing) {
    console.log(`[demo-tenant] ${DEMO_TENANT_SLUG} already exists — reusing`);
    return existing;
  }

  const plan = await ds.getRepository(Plan).findOne({ where: { slug: 'pro' } });
  if (!plan) throw new Error('Pro plan missing — run base seed first');

  const key = generateApiKey();
  const tenant = await repo.save(
    repo.create({
      name: 'Costa del Sol Realty',
      slug: DEMO_TENANT_SLUG,
      domain: 'costadelsolrealty.com',
      ownerEmail: 'info@costadelsolrealty.com',
      siteName: 'Costa del Sol Realty',
      planId: plan.id,
      apiKeyHash: key.hash,
      apiKeyLast4: key.last4,
      webhookSecret: require('crypto').randomBytes(32).toString('hex'),
      subscriptionStatus: 'active',
      billingCycle: 'yearly',
      billingSource: 'manual',
      widgetEnabled: true,
      settings: {
        theme: 'light',
        languages: ['en', 'es'],
        defaultLanguage: 'en',
        timezone: 'Europe/Madrid',
        enableMapView: true,
        enableCurrencyConverter: true,
        baseCurrency: 'EUR',
        availableCurrencies: ['EUR', 'GBP', 'USD'],
        companyName: 'Costa del Sol Realty S.L.',
        websiteUrl: 'https://costadelsolrealty.com',
        primaryColor: '#1e40af',
        wishlistIcon: 'heart',
        listingTypes: {
          resales: { enabled: true, filterId: '', ownFilter: '', minPrice: 0 },
          developments: { enabled: true, filterId: '', ownFilter: '', minPrice: 0 },
          shortRentals: { enabled: false, filterId: '', ownFilter: '', minPrice: 0 },
          longRentals: { enabled: true, filterId: '', ownFilter: '', minPrice: 0 },
        },
      },
    }),
  );
  console.log(`[demo-tenant] ${DEMO_TENANT_SLUG} created (id=${tenant.id})`);
  return tenant;
}

async function seedDemoUsers(ds: DataSource, tenantId: number): Promise<User[]> {
  const repo = ds.getRepository(User);
  const passwordHash = await bcrypt.hash('DemoPassword123!', 12);

  const users = [
    { email: 'admin@costadelsolrealty.com', name: 'Carlos García', role: UserRole.ADMIN },
    { email: 'maria@costadelsolrealty.com', name: 'María López', role: UserRole.USER },
    { email: 'james@costadelsolrealty.com', name: 'James Wilson', role: UserRole.USER },
  ];

  const result: User[] = [];
  for (const u of users) {
    const existing = await repo.findOne({ where: { tenantId, email: u.email } });
    if (existing) {
      console.log(`[demo-user] ${u.email} already exists — skipping`);
      result.push(existing);
      continue;
    }
    const user = await repo.save(
      repo.create({
        tenantId,
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        isActive: true,
        emailVerifiedAt: new Date(),
      }),
    );
    console.log(`[demo-user] ${u.email} created (role=${u.role})`);
    result.push(user);
  }
  return result;
}

async function seedLocations(ds: DataSource, tenantId: number): Promise<Location[]> {
  const repo = ds.getRepository(Location);
  const existing = await repo.findOne({ where: { tenantId, slug: 'spain' } });
  if (existing) {
    console.log('[demo-locations] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  const country = await repo.save(repo.create({
    tenantId, level: 'country', name: { en: 'Spain', es: 'España' },
    slug: 'spain', lat: 40.4168, lng: -3.7038, sortOrder: 0,
  }));

  const province = await repo.save(repo.create({
    tenantId, parentId: country.id, level: 'province',
    name: { en: 'Málaga', es: 'Málaga' }, slug: 'malaga',
    lat: 36.7213, lng: -4.4214, sortOrder: 0,
  }));

  const municipalities = [
    { name: { en: 'Marbella', es: 'Marbella' }, slug: 'marbella', lat: 36.5099, lng: -4.8861 },
    { name: { en: 'Estepona', es: 'Estepona' }, slug: 'estepona', lat: 36.4257, lng: -5.1459 },
    { name: { en: 'Benahavís', es: 'Benahavís' }, slug: 'benahavis', lat: 36.5228, lng: -5.0443 },
    { name: { en: 'Mijas', es: 'Mijas' }, slug: 'mijas', lat: 36.5960, lng: -4.6372 },
    { name: { en: 'Fuengirola', es: 'Fuengirola' }, slug: 'fuengirola', lat: 36.5440, lng: -4.6249 },
  ];

  const muniEntities: Location[] = [];
  for (let i = 0; i < municipalities.length; i++) {
    const m = municipalities[i];
    muniEntities.push(await repo.save(repo.create({
      tenantId, parentId: province.id, level: 'municipality',
      name: m.name, slug: m.slug, lat: m.lat, lng: m.lng, sortOrder: i,
    })));
  }

  const areas = [
    { parent: muniEntities[0], name: { en: 'Golden Mile', es: 'Milla de Oro' }, slug: 'golden-mile' },
    { parent: muniEntities[0], name: { en: 'Puerto Banús', es: 'Puerto Banús' }, slug: 'puerto-banus' },
    { parent: muniEntities[0], name: { en: 'Nueva Andalucía', es: 'Nueva Andalucía' }, slug: 'nueva-andalucia' },
    { parent: muniEntities[1], name: { en: 'New Golden Mile', es: 'Nueva Milla de Oro' }, slug: 'new-golden-mile' },
    { parent: muniEntities[2], name: { en: 'La Zagaleta', es: 'La Zagaleta' }, slug: 'la-zagaleta' },
  ];

  const areaEntities: Location[] = [];
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    areaEntities.push(await repo.save(repo.create({
      tenantId, parentId: a.parent.id, level: 'area',
      name: a.name, slug: a.slug, sortOrder: i,
    })));
  }

  console.log(`[demo-locations] created ${2 + municipalities.length + areas.length} locations`);
  return [country, province, ...muniEntities, ...areaEntities];
}

async function seedPropertyTypes(ds: DataSource, tenantId: number): Promise<PropertyType[]> {
  const repo = ds.getRepository(PropertyType);
  const existing = await repo.findOne({ where: { tenantId, slug: 'villa' } });
  if (existing) {
    console.log('[demo-property-types] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { sortOrder: 'ASC' } });
  }

  const types = [
    { name: { en: 'Villa', es: 'Villa' }, slug: 'villa', icon: 'home' },
    { name: { en: 'Apartment', es: 'Apartamento' }, slug: 'apartment', icon: 'building' },
    { name: { en: 'Townhouse', es: 'Adosado' }, slug: 'townhouse', icon: 'columns' },
    { name: { en: 'Penthouse', es: 'Ático' }, slug: 'penthouse', icon: 'crown' },
    { name: { en: 'Plot', es: 'Parcela' }, slug: 'plot', icon: 'map' },
    { name: { en: 'Country House', es: 'Casa de Campo' }, slug: 'country-house', icon: 'trees' },
  ];

  const result: PropertyType[] = [];
  for (let i = 0; i < types.length; i++) {
    result.push(await repo.save(repo.create({ tenantId, ...types[i], sortOrder: i })));
  }
  console.log(`[demo-property-types] created ${types.length} types`);
  return result;
}

async function seedFeatures(ds: DataSource, tenantId: number): Promise<Feature[]> {
  const repo = ds.getRepository(Feature);
  const existing = await repo.findOne({ where: { tenantId, category: 'exterior' } });
  if (existing) {
    console.log('[demo-features] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  const features: Array<{ category: Feature['category']; name: Record<string, string>; icon: string }> = [
    { category: 'exterior', name: { en: 'Swimming Pool', es: 'Piscina' }, icon: 'waves' },
    { category: 'exterior', name: { en: 'Garden', es: 'Jardín' }, icon: 'flower' },
    { category: 'exterior', name: { en: 'Terrace', es: 'Terraza' }, icon: 'sun' },
    { category: 'interior', name: { en: 'Air Conditioning', es: 'Aire Acondicionado' }, icon: 'wind' },
    { category: 'interior', name: { en: 'Underfloor Heating', es: 'Suelo Radiante' }, icon: 'thermometer' },
    { category: 'interior', name: { en: 'Fireplace', es: 'Chimenea' }, icon: 'flame' },
    { category: 'interior', name: { en: 'Fitted Kitchen', es: 'Cocina Equipada' }, icon: 'utensils' },
    { category: 'security', name: { en: 'Gated Community', es: 'Urbanización Cerrada' }, icon: 'shield' },
    { category: 'security', name: { en: 'Alarm System', es: 'Sistema de Alarma' }, icon: 'bell' },
    { category: 'parking', name: { en: 'Garage', es: 'Garaje' }, icon: 'car' },
    { category: 'parking', name: { en: 'Covered Parking', es: 'Parking Cubierto' }, icon: 'warehouse' },
    { category: 'views', name: { en: 'Sea Views', es: 'Vistas al Mar' }, icon: 'eye' },
    { category: 'views', name: { en: 'Mountain Views', es: 'Vistas a la Montaña' }, icon: 'mountain' },
    { category: 'views', name: { en: 'Golf Views', es: 'Vistas al Golf' }, icon: 'flag' },
    { category: 'community', name: { en: 'Communal Pool', es: 'Piscina Comunitaria' }, icon: 'users' },
    { category: 'community', name: { en: 'Gym', es: 'Gimnasio' }, icon: 'dumbbell' },
    { category: 'climate', name: { en: 'Solar Panels', es: 'Paneles Solares' }, icon: 'zap' },
    { category: 'other', name: { en: 'Storage Room', es: 'Trastero' }, icon: 'box' },
  ];

  const result: Feature[] = [];
  for (let i = 0; i < features.length; i++) {
    result.push(await repo.save(repo.create({ tenantId, ...features[i], sortOrder: i })));
  }
  console.log(`[demo-features] created ${features.length} features`);
  return result;
}

async function seedProperties(
  ds: DataSource,
  tenantId: number,
  locations: Location[],
  types: PropertyType[],
  features: Feature[],
  users: User[],
): Promise<Property[]> {
  const repo = ds.getRepository(Property);
  const existing = await repo.findOne({ where: { tenantId, reference: 'CDS-001' } });
  if (existing) {
    // Backfill agent assignments on existing properties
    if (!existing.agentId && users.length >= 2) {
      const refs: Record<string, { agentId?: number; salesAgentId?: number }> = {
        'CDS-001': { agentId: users[0]?.id, salesAgentId: users[1]?.id },
        'CDS-002': { agentId: users[0]?.id },
        'CDS-008': { agentId: users[1]?.id, salesAgentId: users[0]?.id },
      };
      for (const [ref, ids] of Object.entries(refs)) {
        await repo.update({ tenantId, reference: ref }, ids);
      }
      console.log('[demo-properties] backfilled agent assignments');
    }
    console.log('[demo-properties] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  const munis = locations.filter((l) => l.level === 'municipality');
  const areas = locations.filter((l) => l.level === 'area');

  const props: Array<Partial<Property>> = [
    {
      reference: 'CDS-001', listingType: 'sale', status: 'active', isPublished: true, isFeatured: true,
      propertyTypeId: types[0].id, locationId: areas[2]?.id || munis[0].id,
      title: { en: 'Luxury Villa in Nueva Andalucía', es: 'Villa de Lujo en Nueva Andalucía' },
      description: { en: 'Stunning 5-bedroom villa with panoramic sea and golf views. Modern design with infinity pool, home cinema, and private spa. Walking distance to Puerto Banús.', es: 'Impresionante villa de 5 dormitorios con vistas panorámicas al mar y al golf. Diseño moderno con piscina infinity, cine en casa y spa privado.' },
      price: 3250000, bedrooms: 5, bathrooms: 6, buildSize: 650, plotSize: 1200, terraceSize: 120, gardenSize: 400,
      features: [features[0].id, features[1].id, features[2].id, features[3].id, features[4].id, features[7].id, features[9].id, features[11].id, features[13].id],
      lat: 36.5120, lng: -4.9350, publishedAt: new Date('2026-03-15'),
      // New fields
      street: 'Calle del Valle', streetNumber: '15', postcode: '29660', floor: null,
      cadastralReference: '7654321AB9876C0001TT',
      communityFees: 450, basuraTax: 95, ibiFees: 3200, commission: 5.00, sharedCommission: false,
      builtYear: 2020, energyConsumption: 68, distanceToBeach: 800,
      slug: 'luxury-villa-nueva-andalucia',
      metaTitle: { en: 'Luxury Villa Nueva Andalucía | Costa del Sol Realty', es: 'Villa de Lujo Nueva Andalucía' },
      metaDescription: { en: 'Stunning 5-bed villa with sea views in Nueva Andalucía, Marbella.', es: 'Impresionante villa de 5 dormitorios con vistas al mar.' },
      metaKeywords: { en: 'villa, marbella, luxury, sea view, nueva andalucia', es: 'villa, marbella, lujo, vistas al mar' },
      pageTitle: { en: 'Luxury Villa for Sale in Nueva Andalucía', es: 'Villa de Lujo en Venta en Nueva Andalucía' },
      agentId: users[0]?.id || null, salesAgentId: users[1]?.id || null,
      isOwnProperty: true, villaSelection: true, luxurySelection: true,
      geoLocationLabel: 'Nueva Andalucía, Marbella',
      websiteUrl: 'https://costadelsolrealty.com/properties/luxury-villa-nueva-andalucia',
      videoUrl: 'https://youtube.com/watch?v=example1',
    },
    {
      reference: 'CDS-002', listingType: 'sale', status: 'active', isPublished: true, isFeatured: true,
      propertyTypeId: types[3].id, locationId: areas[0]?.id || munis[0].id,
      title: { en: 'Beachfront Penthouse on the Golden Mile', es: 'Ático en Primera Línea de Playa en la Milla de Oro' },
      description: { en: 'Exclusive penthouse with 180° sea views, private rooftop terrace with jacuzzi. 24h security, concierge service. Steps from the beach.', es: 'Ático exclusivo con vistas al mar de 180°, terraza privada en la azotea con jacuzzi. Seguridad 24h, servicio de conserjería.' },
      price: 2850000, bedrooms: 4, bathrooms: 4, buildSize: 320, terraceSize: 200,
      features: [features[2].id, features[3].id, features[7].id, features[8].id, features[11].id, features[14].id, features[15].id],
      lat: 36.5070, lng: -4.8920, publishedAt: new Date('2026-03-20'),
      // New fields
      floor: '8', solariumSize: 60, postcode: '29602',
      communityFees: 850, ibiFees: 4500, commission: 4.50, sharedCommission: true,
      builtYear: 2018, energyConsumption: 85, distanceToBeach: 50,
      slug: 'beachfront-penthouse-golden-mile',
      agentId: users[0]?.id || null,
      luxurySelection: true, apartmentSelection: true,
      geoLocationLabel: 'Golden Mile, Marbella',
      mapLink: 'https://maps.google.com/?q=36.5070,-4.8920',
    },
    {
      reference: 'CDS-003', listingType: 'sale', status: 'active', isPublished: true,
      propertyTypeId: types[1].id, locationId: munis[0].id,
      title: { en: 'Modern Apartment in Marbella Center', es: 'Apartamento Moderno en el Centro de Marbella' },
      description: { en: 'Beautifully renovated 2-bedroom apartment in the heart of Marbella Old Town. Open plan living, walking distance to all amenities.', es: 'Apartamento de 2 dormitorios bellamente renovado en el casco antiguo de Marbella.' },
      price: 385000, bedrooms: 2, bathrooms: 2, buildSize: 95, terraceSize: 15,
      features: [features[3].id, features[6].id],
      lat: 36.5094, lng: -4.8825, publishedAt: new Date('2026-04-01'),
    },
    {
      reference: 'CDS-004', listingType: 'sale', status: 'active', isPublished: true,
      propertyTypeId: types[2].id, locationId: munis[1].id,
      title: { en: 'Sea View Townhouse in Estepona', es: 'Adosado con Vistas al Mar en Estepona' },
      description: { en: 'Spacious 3-bedroom townhouse in a quiet residential area. Large rooftop solarium with sea views. Community pool and gardens.', es: 'Amplio adosado de 3 dormitorios en zona residencial tranquila. Gran solárium con vistas al mar.' },
      price: 495000, bedrooms: 3, bathrooms: 3, buildSize: 180, plotSize: 60, terraceSize: 40,
      features: [features[2].id, features[3].id, features[11].id, features[14].id],
      lat: 36.4270, lng: -5.1450, publishedAt: new Date('2026-04-05'),
    },
    {
      reference: 'CDS-005', listingType: 'sale', status: 'active', isPublished: true, isFeatured: true,
      propertyTypeId: types[0].id, locationId: areas[4]?.id || munis[2].id,
      title: { en: 'Exclusive Estate in La Zagaleta', es: 'Finca Exclusiva en La Zagaleta' },
      description: { en: 'Magnificent estate in the prestigious La Zagaleta community. 7 bedrooms, staff quarters, wine cellar, indoor and outdoor pools. Unrivaled privacy and luxury.', es: 'Magnífica finca en la prestigiosa comunidad de La Zagaleta. 7 dormitorios, vivienda de servicio, bodega.' },
      price: 8500000, bedrooms: 7, bathrooms: 8, buildSize: 1200, plotSize: 5000, gardenSize: 3000,
      features: [features[0].id, features[1].id, features[3].id, features[4].id, features[5].id, features[7].id, features[8].id, features[9].id, features[12].id],
      lat: 36.5250, lng: -5.0500, publishedAt: new Date('2026-02-10'), priceOnRequest: false,
    },
    {
      reference: 'CDS-006', listingType: 'rent', status: 'active', isPublished: true,
      propertyTypeId: types[1].id, locationId: areas[1]?.id || munis[0].id,
      title: { en: 'Luxury Rental near Puerto Banús', es: 'Alquiler de Lujo cerca de Puerto Banús' },
      description: { en: 'Stunning 3-bedroom apartment for long-term rent. Fully furnished to highest standards. Walking distance to Puerto Banús marina and beach.', es: 'Impresionante apartamento de 3 dormitorios en alquiler de larga duración. Totalmente amueblado.' },
      price: 3500, bedrooms: 3, bathrooms: 2, buildSize: 140, terraceSize: 30,
      features: [features[3].id, features[6].id, features[14].id, features[15].id],
      lat: 36.4890, lng: -4.9530, publishedAt: new Date('2026-04-10'),
    },
    {
      reference: 'CDS-007', listingType: 'rent', status: 'active', isPublished: true,
      propertyTypeId: types[0].id, locationId: munis[3].id,
      title: { en: 'Family Villa for Rent in Mijas', es: 'Villa Familiar en Alquiler en Mijas' },
      description: { en: 'Charming 4-bedroom villa with private pool and mountain views. Perfect for families. 10 minutes to Fuengirola beach.', es: 'Encantadora villa de 4 dormitorios con piscina privada y vistas a la montaña.' },
      price: 2800, bedrooms: 4, bathrooms: 3, buildSize: 220, plotSize: 800, gardenSize: 400,
      features: [features[0].id, features[1].id, features[3].id, features[9].id, features[12].id],
      lat: 36.5965, lng: -4.6380, publishedAt: new Date('2026-04-12'),
    },
    {
      reference: 'CDS-008', listingType: 'development', status: 'active', isPublished: true, isFeatured: true,
      propertyTypeId: types[1].id, locationId: areas[3]?.id || munis[1].id,
      title: { en: 'Off-Plan Apartments - Estepona Beach', es: 'Apartamentos sobre Plano - Playa Estepona' },
      description: { en: 'New development of contemporary apartments with sea views. Completion Q2 2027. 2 and 3-bedroom units from €345,000. Community pool, gym, and co-working space.', es: 'Nueva promoción de apartamentos contemporáneos con vistas al mar. Entrega T2 2027.' },
      price: 345000, bedrooms: 2, bathrooms: 2, buildSize: 95, terraceSize: 25,
      features: [features[2].id, features[3].id, features[11].id, features[14].id, features[15].id, features[16].id],
      lat: 36.4310, lng: -5.1200, publishedAt: new Date('2026-04-08'), deliveryDate: new Date('2027-06-30'),
      // New fields
      completionDate: new Date('2027-06-30') as any, project: 'Estepona Beach Residences',
      slug: 'off-plan-estepona-beach',
      distanceToBeach: 200, apartmentSelection: true,
      externalLink: 'https://esteponabeachresidences.com',
      blogUrl: 'https://costadelsolrealty.com/blog/estepona-beach-launch',
      geoLocationLabel: 'Estepona Beach, Estepona',
      agentId: users[1]?.id || null, salesAgentId: users[0]?.id || null,
    },
    {
      reference: 'CDS-009', listingType: 'sale', status: 'sold',
      propertyTypeId: types[0].id, locationId: munis[0].id,
      title: { en: 'Renovated Villa in Marbella East', es: 'Villa Renovada en Marbella Este' },
      description: { en: 'Recently sold. Beautiful 4-bedroom villa with modern interiors and tropical garden.', es: 'Vendida recientemente. Preciosa villa de 4 dormitorios.' },
      price: 1450000, bedrooms: 4, bathrooms: 4, buildSize: 350, plotSize: 900,
      features: [features[0].id, features[1].id, features[3].id, features[9].id],
      lat: 36.5180, lng: -4.8550, soldAt: new Date('2026-04-18'), publishedAt: new Date('2026-01-20'),
    },
    {
      reference: 'CDS-010', listingType: 'sale', status: 'draft',
      propertyTypeId: types[4].id, locationId: munis[2].id,
      title: { en: 'Building Plot in Benahavís', es: 'Parcela en Benahavís' },
      description: { en: 'South-facing plot with sea and mountain views. Project approved for a 4-bedroom villa. All mains services connected.', es: 'Parcela orientada al sur con vistas al mar y la montaña. Proyecto aprobado para villa de 4 dormitorios.' },
      price: 595000, plotSize: 2200,
      features: [features[11].id, features[12].id],
      lat: 36.5230, lng: -5.0440,
    },
    {
      reference: 'CDS-011', listingType: 'sale', status: 'active', isPublished: true,
      propertyTypeId: types[5].id, locationId: munis[3].id,
      title: { en: 'Andalusian Country House in Mijas', es: 'Cortijo Andaluz en Mijas' },
      description: { en: 'Charming finca with 3 bedrooms, original character, and panoramic countryside views. Ideal for equestrian or rural tourism. Separate guest house.', es: 'Encantadora finca de 3 dormitorios con carácter original y vistas panorámicas al campo.' },
      price: 720000, bedrooms: 3, bathrooms: 2, buildSize: 280, plotSize: 12000, gardenSize: 8000,
      features: [features[1].id, features[5].id, features[12].id, features[17].id],
      lat: 36.6010, lng: -4.6400, publishedAt: new Date('2026-03-25'),
    },
    {
      reference: 'CDS-012', listingType: 'sale', status: 'active', isPublished: true,
      propertyTypeId: types[1].id, locationId: munis[4].id,
      title: { en: 'Beachfront Apartment in Fuengirola', es: 'Apartamento en Primera Línea en Fuengirola' },
      description: { en: 'Bright 2-bedroom apartment directly on Fuengirola beach promenade. Recently renovated with modern finishes. Community pool.', es: 'Luminoso apartamento de 2 dormitorios directamente en el paseo marítimo de Fuengirola.' },
      price: 295000, bedrooms: 2, bathrooms: 1, buildSize: 78, terraceSize: 12,
      features: [features[3].id, features[6].id, features[11].id, features[14].id],
      lat: 36.5440, lng: -4.6249, publishedAt: new Date('2026-04-15'),
    },
    {
      reference: 'CDS-013', listingType: 'sale', status: 'archived',
      propertyTypeId: types[2].id, locationId: munis[0].id,
      title: { en: 'Archived — Townhouse San Pedro', es: 'Archivado — Adosado San Pedro' },
      description: { en: 'This listing has been archived by the agent.', es: 'Este anuncio ha sido archivado.' },
      price: 410000, bedrooms: 3, bathrooms: 2, buildSize: 150,
      lat: 36.4930, lng: -4.9900,
    },
    {
      reference: 'CDS-014', listingType: 'rent', status: 'rented',
      propertyTypeId: types[1].id, locationId: munis[4].id,
      title: { en: 'Rented — Studio Fuengirola', es: 'Alquilado — Estudio Fuengirola' },
      description: { en: 'This unit has been rented.', es: 'Esta unidad ha sido alquilada.' },
      price: 850, bedrooms: 1, bathrooms: 1, buildSize: 45,
      lat: 36.5425, lng: -4.6260,
    },
    {
      reference: 'CDS-015', listingType: 'sale', status: 'active', isPublished: true,
      propertyTypeId: types[3].id, locationId: munis[0].id,
      title: { en: 'Duplex Penthouse with Private Pool', es: 'Ático Dúplex con Piscina Privada' },
      description: { en: 'Spectacular duplex penthouse in the heart of Marbella. Private rooftop pool and solarium with 360° views. 3 en-suite bedrooms.', es: 'Espectacular ático dúplex en el corazón de Marbella. Piscina privada en azotea con vistas 360°.' },
      price: 1950000, bedrooms: 3, bathrooms: 3, buildSize: 240, terraceSize: 150,
      features: [features[0].id, features[2].id, features[3].id, features[7].id, features[8].id, features[9].id, features[11].id],
      lat: 36.5100, lng: -4.8850, publishedAt: new Date('2026-04-20'),
    },
  ];

  const result: Property[] = [];
  for (const p of props) {
    result.push(await repo.save(repo.create({ tenantId, source: 'manual', currency: 'EUR', ...p })));
  }
  console.log(`[demo-properties] created ${props.length} properties`);
  return result;
}

async function seedContacts(ds: DataSource, tenantId: number, properties: Property[]): Promise<Contact[]> {
  const repo = ds.getRepository(Contact);
  const existing = await repo.findOne({ where: { tenantId, email: 'john.smith@email.com' } });
  if (existing) {
    console.log('[demo-contacts] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  const contacts: Array<Partial<Contact>> = [
    { email: 'john.smith@email.com', name: 'John Smith', phone: '+44 7700 900001', source: 'inquiry', sourcePropertyId: properties[0]?.id, tags: ['hot', 'investor'], preferences: { language: 'en', minPrice: 2000000, maxPrice: 5000000 } },
    { email: 'sophie.mueller@email.de', name: 'Sophie Müller', phone: '+49 151 12345678', source: 'inquiry', sourcePropertyId: properties[1]?.id, tags: ['hot'], preferences: { language: 'en', minPrice: 1500000, maxPrice: 3000000 } },
    { email: 'ahmed.hassan@email.com', name: 'Ahmed Hassan', phone: '+971 50 123 4567', source: 'inquiry', sourcePropertyId: properties[4]?.id, tags: ['vip', 'investor'], preferences: { language: 'en', minPrice: 5000000 } },
    { email: 'emma.johnson@email.co.uk', name: 'Emma Johnson', phone: '+44 7700 900002', source: 'newsletter', tags: ['newsletter'], preferences: { language: 'en', minPrice: 300000, maxPrice: 600000 } },
    { email: 'pierre.dubois@email.fr', name: 'Pierre Dubois', phone: '+33 6 12 34 56 78', source: 'inquiry', sourcePropertyId: properties[2]?.id, preferences: { language: 'en', minPrice: 200000, maxPrice: 500000 } },
    { email: 'anna.petersen@email.se', name: 'Anna Petersen', phone: '+46 70 123 45 67', source: 'manual', tags: ['referral'], preferences: { language: 'en', minPrice: 400000, maxPrice: 800000 } },
    { email: 'michael.brown@email.com', name: 'Michael Brown', phone: '+1 555 123 4567', source: 'inquiry', sourcePropertyId: properties[5]?.id, tags: ['rental'], preferences: { language: 'en' } },
    { email: 'lucia.romero@email.es', name: 'Lucía Romero', phone: '+34 612 345 678', source: 'newsletter', tags: ['newsletter', 'local'], preferences: { language: 'es' } },
    { email: 'david.williams@email.co.uk', name: 'David Williams', phone: '+44 7700 900003', source: 'inquiry', sourcePropertyId: properties[7]?.id, tags: ['development'], preferences: { language: 'en', minPrice: 300000, maxPrice: 500000 } },
    { email: 'olga.ivanova@email.ru', name: 'Olga Ivanova', phone: '+7 916 123 45 67', source: 'manual', tags: ['cash-buyer'], preferences: { language: 'en', minPrice: 1000000, maxPrice: 3000000 } },
    { email: 'thomas.nielsen@email.dk', name: 'Thomas Nielsen', source: 'api', preferences: { language: 'en' }, subscribed: false, unsubscribedAt: new Date('2026-04-01') },
    { email: 'sarah.connor@email.com', name: 'Sarah Connor', phone: '+44 7700 900004', source: 'inquiry', sourcePropertyId: properties[11]?.id, preferences: { language: 'en', minPrice: 200000, maxPrice: 350000 } },
  ];

  const result: Contact[] = [];
  for (const c of contacts) {
    result.push(await repo.save(repo.create({ tenantId, ...c })));
  }
  console.log(`[demo-contacts] created ${contacts.length} contacts`);
  return result;
}

async function seedLeads(
  ds: DataSource, tenantId: number,
  contacts: Contact[], properties: Property[], users: User[],
): Promise<Lead[]> {
  const repo = ds.getRepository(Lead);
  const actRepo = ds.getRepository(LeadActivity);
  const existing = await repo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-leads] already exist — skipping');
    return repo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  const adminUser = users[0];
  const agentUser = users[1] || users[0];

  const leads: Array<Partial<Lead>> = [
    { contactId: contacts[0].id, propertyId: properties[0]?.id, source: 'widget_inquiry', status: 'viewing_scheduled', assignedTo: adminUser.id, score: 85, budgetMin: 2500000, budgetMax: 4000000, notes: 'Very interested in Nueva Andalucía area. Scheduled viewing for next Tuesday.', nextFollowUp: new Date('2026-04-28'), lastContactAt: new Date('2026-04-22') },
    { contactId: contacts[1].id, propertyId: properties[1]?.id, source: 'email', status: 'qualified', assignedTo: agentUser.id, score: 70, budgetMin: 2000000, budgetMax: 3000000, notes: 'Looking for a beachfront penthouse. Prefers Golden Mile area.', nextFollowUp: new Date('2026-04-30') },
    { contactId: contacts[2].id, propertyId: properties[4]?.id, source: 'referral', status: 'offer_made', assignedTo: adminUser.id, score: 95, budgetMin: 5000000, budgetMax: 10000000, notes: 'Offered €8.2M. Awaiting response from seller.', lastContactAt: new Date('2026-04-20') },
    { contactId: contacts[3].id, source: 'website', status: 'new', score: 30, budgetMin: 300000, budgetMax: 500000, notes: 'Signed up via newsletter. Interested in Costa del Sol generally.' },
    { contactId: contacts[4].id, propertyId: properties[2]?.id, source: 'widget_inquiry', status: 'contacted', assignedTo: agentUser.id, score: 50, budgetMin: 250000, budgetMax: 450000, lastContactAt: new Date('2026-04-19') },
    { contactId: contacts[5].id, source: 'referral', status: 'qualified', assignedTo: adminUser.id, score: 60, budgetMin: 500000, budgetMax: 800000, notes: 'Referred by existing client. Looking for a family home with pool.' },
    { contactId: contacts[6].id, propertyId: properties[5]?.id, source: 'widget_inquiry', status: 'contacted', assignedTo: agentUser.id, score: 40, notes: 'Interested in long-term rental near Puerto Banús. Relocating in June.' },
    { contactId: contacts[8].id, propertyId: properties[7]?.id, source: 'widget_inquiry', status: 'new', score: 55, budgetMin: 300000, budgetMax: 500000, notes: 'Interested in the off-plan development.' },
    { contactId: contacts[9].id, source: 'phone', status: 'negotiating', assignedTo: adminUser.id, score: 90, budgetMin: 1500000, budgetMax: 2500000, notes: 'Cash buyer. Negotiating on CDS-015.', lastContactAt: new Date('2026-04-21') },
    { contactId: contacts[11].id, propertyId: properties[11]?.id, source: 'widget_inquiry', status: 'won', assignedTo: agentUser.id, score: 100, wonAt: new Date('2026-04-15'), wonPropertyId: properties[11]?.id, wonAmount: 288000, budgetMin: 200000, budgetMax: 320000 },
  ];

  const result: Lead[] = [];
  for (const l of leads) {
    result.push(await repo.save(repo.create({ tenantId, ...l })));
  }

  const activities: Array<Partial<LeadActivity>> = [
    { leadId: result[0].id, userId: adminUser.id, type: 'note', description: 'Initial contact — very keen on the villa, wants to schedule a viewing.' },
    { leadId: result[0].id, userId: adminUser.id, type: 'call', description: 'Called to confirm viewing. Tuesday 10am at the property.' },
    { leadId: result[0].id, userId: adminUser.id, type: 'viewing', description: 'Viewing scheduled for 2026-04-28 at 10:00.' },
    { leadId: result[2].id, userId: adminUser.id, type: 'meeting', description: 'Met at La Zagaleta. Full tour of the estate.' },
    { leadId: result[2].id, userId: adminUser.id, type: 'offer', description: 'Offer submitted: €8,200,000.' },
    { leadId: result[4].id, userId: agentUser.id, type: 'email', description: 'Sent brochure for Marbella center apartment and two similar listings.' },
    { leadId: result[9].id, userId: agentUser.id, type: 'status_change', description: 'Sale completed. Final price: €288,000.' },
  ];
  for (const a of activities) {
    await actRepo.save(actRepo.create(a));
  }

  console.log(`[demo-leads] created ${leads.length} leads with ${activities.length} activities`);
  return result;
}

async function seedTickets(ds: DataSource, tenantId: number, users: User[]): Promise<Ticket[]> {
  const repo = ds.getRepository(Ticket);
  const msgRepo = ds.getRepository(TicketMessage);
  const existing = await repo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-tickets] already exist — skipping');
    return repo.find({ where: { tenantId } });
  }

  const user = users[0];

  const tickets: Array<Partial<Ticket> & { _messages: Array<Partial<TicketMessage>> }> = [
    {
      ticketNumber: 'TKT-001', subject: 'Widget not loading on our WordPress site',
      status: 'in_progress', priority: 'high', category: 'technical',
      userId: user.id, assignedTo: user.id,
      firstResponseAt: new Date('2026-04-20T10:30:00Z'),
      _messages: [
        { userId: user.id, isStaff: false, message: 'The property widget stopped loading on our WordPress site since yesterday. We get a blank white area where the widget should appear. Our site URL is costadelsolrealty.com/properties. Can you please look into this urgently?' },
        { userId: user.id, isStaff: true, message: 'Thank you for reporting this. I can see the issue — there was a cache invalidation problem after the last update. I\'ve cleared the CDN cache and the widget should be loading again within 5 minutes. Could you please confirm once you see it working?' },
        { userId: user.id, isStaff: false, message: 'It\'s loading now but the search filters seem to be showing in English only. We had it configured for both EN and ES. Can you check the language settings too?' },
      ],
    },
    {
      ticketNumber: 'TKT-002', subject: 'Request to upgrade plan from Pro to Enterprise',
      status: 'open', priority: 'medium', category: 'billing',
      userId: user.id,
      _messages: [
        { userId: user.id, isStaff: false, message: 'We\'re approaching our property limit on the Pro plan and would like to discuss upgrading to Enterprise. We currently have about 2,300 listings and expect to grow to 5,000+ in the next quarter. Can someone from the billing team reach out to discuss pricing?' },
      ],
    },
    {
      ticketNumber: 'TKT-003', subject: 'Feature request: bulk property import from CSV',
      status: 'waiting_customer', priority: 'low', category: 'feature_request',
      userId: user.id, assignedTo: user.id,
      firstResponseAt: new Date('2026-04-15T14:00:00Z'),
      _messages: [
        { userId: user.id, isStaff: false, message: 'Is there any way to bulk import properties from a CSV file? We have a large portfolio from another platform we\'d like to migrate.' },
        { userId: user.id, isStaff: true, message: 'Great suggestion! We actually have a migration tool that can import from CSV. Could you share a sample of your CSV format (with dummy data) so we can check compatibility? We support most common property listing formats.' },
      ],
    },
    {
      ticketNumber: 'TKT-004', subject: 'Email campaign delivery issues',
      status: 'resolved', priority: 'high', category: 'bug',
      userId: user.id, assignedTo: user.id,
      firstResponseAt: new Date('2026-04-10T09:00:00Z'),
      resolvedAt: new Date('2026-04-11T16:00:00Z'),
      _messages: [
        { userId: user.id, isStaff: false, message: 'Our last email campaign showed 40% bounce rate which is way higher than usual. We checked and all the email addresses are valid.' },
        { userId: user.id, isStaff: true, message: 'I\'ve investigated the bounces and found the issue — your sending domain SPF record was misconfigured after a recent DNS change. I\'ve updated the documentation with the correct SPF include. Please update your DNS and we can do a test send.' },
        { userId: user.id, isStaff: false, message: 'Updated the SPF record. Can we test now?' },
        { userId: user.id, isStaff: true, message: 'Test send went through perfectly — 100% delivery. The SPF record is now correct. Marking this as resolved. Let us know if you need anything else!' },
      ],
    },
    {
      ticketNumber: 'TKT-005', subject: 'How to set up feed import from Resales Online',
      status: 'closed', priority: 'low', category: 'general',
      userId: user.id, assignedTo: user.id,
      firstResponseAt: new Date('2026-04-05T11:00:00Z'),
      resolvedAt: new Date('2026-04-05T15:00:00Z'),
      closedAt: new Date('2026-04-06T09:00:00Z'),
      _messages: [
        { userId: user.id, isStaff: false, message: 'I\'d like to set up automatic property import from our Resales Online feed. Where do I find the configuration?' },
        { userId: user.id, isStaff: true, message: 'Go to Dashboard → Feeds and click "Add Feed Configuration". Select "Resales Online" as the provider and enter your API credentials. The default sync schedule is daily at 2am UTC. Would you like me to walk you through it?' },
        { userId: user.id, isStaff: false, message: 'Found it, thank you! All set up and the first sync ran successfully.' },
      ],
    },
  ];

  const result: Ticket[] = [];
  for (const t of tickets) {
    const { _messages, ...ticketData } = t;
    const ticket = await repo.save(repo.create({ tenantId, ...ticketData }));
    for (const m of _messages) {
      await msgRepo.save(msgRepo.create({ ticketId: ticket.id, ...m }));
    }
    result.push(ticket);
  }
  console.log(`[demo-tickets] created ${tickets.length} tickets`);
  return result;
}

async function seedLabels(ds: DataSource, tenantId: number): Promise<void> {
  const repo = ds.getRepository(Label);
  const existing = await repo.findOne({ where: { tenantId, key: 'search.title' } });
  if (existing) {
    console.log('[demo-labels] already exist — skipping');
    return;
  }

  const labels = [
    { key: 'search.title', translations: { en: 'Find Your Dream Property', es: 'Encuentra Tu Propiedad Ideal' } },
    { key: 'search.bedrooms', translations: { en: 'Bedrooms', es: 'Dormitorios' } },
    { key: 'search.bathrooms', translations: { en: 'Bathrooms', es: 'Baños' } },
    { key: 'search.price', translations: { en: 'Price', es: 'Precio' } },
    { key: 'search.location', translations: { en: 'Location', es: 'Ubicación' } },
    { key: 'search.type', translations: { en: 'Property Type', es: 'Tipo de Propiedad' } },
    { key: 'search.button', translations: { en: 'Search Properties', es: 'Buscar Propiedades' } },
    { key: 'detail.price', translations: { en: 'Price', es: 'Precio' } },
    { key: 'detail.bedrooms', translations: { en: 'Bedrooms', es: 'Dormitorios' } },
    { key: 'detail.bathrooms', translations: { en: 'Bathrooms', es: 'Baños' } },
    { key: 'detail.buildSize', translations: { en: 'Built Area', es: 'Superficie Construida' } },
    { key: 'detail.plotSize', translations: { en: 'Plot Size', es: 'Tamaño de Parcela' } },
    { key: 'detail.features', translations: { en: 'Features', es: 'Características' } },
    { key: 'detail.description', translations: { en: 'Description', es: 'Descripción' } },
    { key: 'detail.contact', translations: { en: 'Contact Agent', es: 'Contactar Agente' } },
    { key: 'detail.reference', translations: { en: 'Reference', es: 'Referencia' } },
    { key: 'wishlist.title', translations: { en: 'My Wishlist', es: 'Mi Lista de Deseos' } },
    { key: 'general.noResults', translations: { en: 'No properties found', es: 'No se encontraron propiedades' } },
    { key: 'general.currency', translations: { en: 'Currency', es: 'Moneda' } },
    { key: 'general.listingType.sale', translations: { en: 'For Sale', es: 'En Venta' } },
    { key: 'general.listingType.rent', translations: { en: 'For Rent', es: 'En Alquiler' } },
    { key: 'general.listingType.development', translations: { en: 'New Development', es: 'Obra Nueva' } },
  ];

  for (const l of labels) {
    await repo.save(repo.create({ tenantId, ...l, isCustom: false }));
  }
  console.log(`[demo-labels] created ${labels.length} labels`);
}

async function seedAnalytics(ds: DataSource, tenantId: number, properties: Property[]): Promise<void> {
  const viewRepo = ds.getRepository(PropertyView);
  const searchRepo = ds.getRepository(SearchLog);

  const existing = await viewRepo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-analytics] already exist — skipping');
    return;
  }

  const publishedProps = properties.filter((p) => p.isPublished);
  const sessions = Array.from({ length: 30 }, (_, i) => `sess_demo_${String(i).padStart(3, '0')}`);
  const referrers = ['https://google.com', 'https://idealista.com', 'https://rightmove.co.uk', null, null, 'https://facebook.com'];

  const views: Array<Partial<PropertyView>> = [];
  for (let day = 0; day < 30; day++) {
    const date = new Date();
    date.setDate(date.getDate() - (30 - day));
    const viewsPerDay = 5 + Math.floor(Math.random() * 15);
    for (let v = 0; v < viewsPerDay; v++) {
      const prop = publishedProps[Math.floor(Math.random() * publishedProps.length)];
      if (!prop) continue;
      date.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
      views.push({
        tenantId, propertyId: prop.id,
        sessionId: sessions[Math.floor(Math.random() * sessions.length)],
        referrer: referrers[Math.floor(Math.random() * referrers.length)],
        durationSeconds: 10 + Math.floor(Math.random() * 300),
        inquiryMade: Math.random() < 0.08,
        viewedAt: new Date(date),
      });
    }
  }
  await viewRepo.save(views.map((v) => viewRepo.create(v)));

  const searches: Array<Partial<SearchLog>> = [];
  for (let day = 0; day < 30; day++) {
    const date = new Date();
    date.setDate(date.getDate() - (30 - day));
    const searchesPerDay = 3 + Math.floor(Math.random() * 10);
    for (let s = 0; s < searchesPerDay; s++) {
      date.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
      searches.push({
        tenantId,
        sessionId: sessions[Math.floor(Math.random() * sessions.length)],
        filters: { listingType: ['sale', 'rent'][Math.floor(Math.random() * 2)], minPrice: [100000, 200000, 500000][Math.floor(Math.random() * 3)] },
        resultsCount: Math.floor(Math.random() * 15),
        clickedPropertyId: Math.random() < 0.6 ? publishedProps[Math.floor(Math.random() * publishedProps.length)]?.id || null : null,
        searchedAt: new Date(date),
      });
    }
  }
  await searchRepo.save(searches.map((s) => searchRepo.create(s)));

  console.log(`[demo-analytics] created ${views.length} property views, ${searches.length} search logs`);
}

async function seedLicenseKeys(ds: DataSource, tenantId: number): Promise<void> {
  const repo = ds.getRepository(LicenseKey);
  const existing = await repo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-license-keys] already exist — skipping');
    return;
  }

  const keys = [
    { key: LicenseKey.generateKey(), status: 'active' as const, domain: 'costadelsolrealty.com', activatedAt: new Date('2026-01-15'), lastUsedAt: new Date('2026-04-23') },
    { key: LicenseKey.generateKey(), status: 'active' as const, domain: 'costadelsolrealty.es', activatedAt: new Date('2026-02-20'), lastUsedAt: new Date('2026-04-22') },
    { key: LicenseKey.generateKey(), status: 'revoked' as const, domain: 'old-site.costadelsolrealty.com', activatedAt: new Date('2025-06-01'), revokedAt: new Date('2026-01-10') },
  ];

  for (const k of keys) {
    await repo.save(repo.create({ tenantId, ...k }));
  }
  console.log(`[demo-license-keys] created ${keys.length} license keys`);
}

async function seedCredits(ds: DataSource, tenantId: number, users: User[]): Promise<void> {
  const balRepo = ds.getRepository(CreditBalance);
  const txRepo = ds.getRepository(CreditTransaction);

  const existing = await balRepo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-credits] already exist — skipping');
    return;
  }

  await balRepo.save(balRepo.create({ tenantId, balance: 47.50 }));

  const userId = users[0].id;
  const txs: Array<Partial<CreditTransaction>> = [
    { type: 'purchase', amount: 100, balanceAfter: 100, description: 'Initial credit purchase', paymentReference: 'INV-2026-001', createdBy: userId },
    { type: 'consume', amount: -25, balanceAfter: 75, description: 'Webmaster support — widget customization (2.5 hrs)', createdBy: userId },
    { type: 'consume', amount: -15, balanceAfter: 60, description: 'Webmaster support — DNS configuration (1.5 hrs)', createdBy: userId },
    { type: 'purchase', amount: 50, balanceAfter: 110, description: 'Top-up credit purchase', paymentReference: 'INV-2026-002', createdBy: userId },
    { type: 'consume', amount: -32.50, balanceAfter: 77.50, description: 'Webmaster support — feed import troubleshooting (3.25 hrs)', createdBy: userId },
    { type: 'consume', amount: -30, balanceAfter: 47.50, description: 'Webmaster support — email template design (3 hrs)', createdBy: userId },
  ];

  for (const tx of txs) {
    await txRepo.save(txRepo.create({ tenantId, ...tx }));
  }
  console.log(`[demo-credits] created balance (47.50) with ${txs.length} transactions`);
}

async function seedEmailTemplatesAndCampaigns(ds: DataSource, tenantId: number, properties: Property[]): Promise<void> {
  const tplRepo = ds.getRepository(EmailTemplate);
  const campRepo = ds.getRepository(EmailCampaign);

  const existing = await tplRepo.findOne({ where: { tenantId } });
  if (existing) {
    console.log('[demo-email] already exist — skipping');
    return;
  }

  const templates = [
    {
      name: 'New Listing Alert',
      subject: 'New Property: {{property.title}}',
      type: 'property_alert' as const,
      isDefault: true,
      bodyHtml: '<h1>New Listing Alert</h1><p>A new property matching your preferences has been listed:</p><h2>{{property.title}}</h2><p>Price: {{property.price}}</p><p>Location: {{property.location}}</p><p><a href="{{property.url}}">View Property</a></p>',
      bodyText: 'New Listing: {{property.title}}\nPrice: {{property.price}}\nLocation: {{property.location}}',
    },
    {
      name: 'Monthly Newsletter',
      subject: 'Costa del Sol Property Market Update — {{month}}',
      type: 'newsletter' as const,
      bodyHtml: '<h1>Monthly Market Update</h1><p>Dear {{contact.name}},</p><p>Here are the latest highlights from the Costa del Sol property market:</p><h2>Featured Properties</h2>{{#each featuredProperties}}<div><h3>{{this.title}}</h3><p>{{this.price}} — {{this.location}}</p></div>{{/each}}<p>Best regards,<br/>Costa del Sol Realty</p>',
      bodyText: 'Monthly Market Update\n\nDear {{contact.name}},\n\nHere are the latest highlights from the Costa del Sol property market.',
    },
    {
      name: 'Welcome Email',
      subject: 'Welcome to Costa del Sol Realty',
      type: 'welcome' as const,
      bodyHtml: '<h1>Welcome!</h1><p>Dear {{contact.name}},</p><p>Thank you for your interest in Costa del Sol properties. We are here to help you find your perfect home in the sun.</p><p>Browse our latest listings: <a href="{{siteUrl}}/properties">View Properties</a></p>',
      bodyText: 'Welcome to Costa del Sol Realty!\n\nThank you for your interest.',
    },
  ];

  const savedTemplates: EmailTemplate[] = [];
  for (const t of templates) {
    savedTemplates.push(await tplRepo.save(tplRepo.create({ tenantId, ...t })));
  }

  const publishedIds = properties.filter((p) => p.isPublished && p.isFeatured).map((p) => p.id);
  const campaigns: Array<Partial<EmailCampaign>> = [
    {
      templateId: savedTemplates[1].id, name: 'April 2026 Newsletter', subject: 'Costa del Sol Property Market Update — April 2026',
      status: 'sent', totalRecipients: 156, sentCount: 148, failedCount: 3, openCount: 67, clickCount: 23, unsubscribeCount: 2, bounceCount: 5,
      scheduledAt: new Date('2026-04-01T09:00:00Z'), startedAt: new Date('2026-04-01T09:00:00Z'), completedAt: new Date('2026-04-01T09:45:00Z'),
      featuredProperties: publishedIds,
    },
    {
      templateId: savedTemplates[1].id, name: 'March 2026 Newsletter', subject: 'Costa del Sol Property Market Update — March 2026',
      status: 'sent', totalRecipients: 142, sentCount: 138, failedCount: 1, openCount: 72, clickCount: 31, unsubscribeCount: 1, bounceCount: 3,
      scheduledAt: new Date('2026-03-01T09:00:00Z'), startedAt: new Date('2026-03-01T09:00:00Z'), completedAt: new Date('2026-03-01T09:30:00Z'),
      featuredProperties: publishedIds,
    },
    {
      templateId: savedTemplates[0].id, name: 'La Zagaleta Estate Alert', subject: 'Exclusive: New Listing in La Zagaleta',
      status: 'sent', totalRecipients: 28, sentCount: 28, failedCount: 0, openCount: 19, clickCount: 8, unsubscribeCount: 0, bounceCount: 0,
      scheduledAt: new Date('2026-02-12T10:00:00Z'), startedAt: new Date('2026-02-12T10:00:00Z'), completedAt: new Date('2026-02-12T10:05:00Z'),
    },
    {
      templateId: savedTemplates[1].id, name: 'May 2026 Newsletter', subject: 'Costa del Sol Property Market Update — May 2026',
      status: 'scheduled', totalRecipients: 160,
      scheduledAt: new Date('2026-05-01T09:00:00Z'),
      featuredProperties: publishedIds,
    },
    {
      templateId: savedTemplates[0].id, name: 'New Penthouse Alert — Draft', subject: 'New Duplex Penthouse in Marbella',
      status: 'draft',
    },
  ];

  for (const c of campaigns) {
    await campRepo.save(campRepo.create({ tenantId, ...c }));
  }
  console.log(`[demo-email] created ${templates.length} templates, ${campaigns.length} campaigns`);
}

async function main(): Promise<void> {
  const ds = await dataSource.initialize();
  try {
    const tenant = await seedDemoTenant(ds);
    const tid = tenant.id;

    const users = await seedDemoUsers(ds, tid);
    const locations = await seedLocations(ds, tid);
    const types = await seedPropertyTypes(ds, tid);
    const features = await seedFeatures(ds, tid);
    const properties = await seedProperties(ds, tid, locations, types, features, users);
    const contacts = await seedContacts(ds, tid, properties);
    await seedLeads(ds, tid, contacts, properties, users);
    await seedTickets(ds, tid, users);
    await seedLabels(ds, tid);
    await seedAnalytics(ds, tid, properties);
    await seedLicenseKeys(ds, tid);
    await seedCredits(ds, tid, users);
    await seedEmailTemplatesAndCampaigns(ds, tid, properties);

    console.log('\nDemo data seed complete.');
    console.log(`\nDemo tenant login:`);
    console.log(`  Email:    admin@costadelsolrealty.com`);
    console.log(`  Password: DemoPassword123!`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
