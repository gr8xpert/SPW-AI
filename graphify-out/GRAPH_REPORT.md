# Graph Report - .  (2026-04-11)

## Corpus Check
- Large corpus: 304 files · ~86,979 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1199 nodes · 1461 edges · 104 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `SuperAdminController` - 22 edges
2. `SuperAdminService` - 22 edges
3. `EmailCampaignService` - 19 edges
4. `SPWWidget` - 19 edges
5. `UploadService` - 18 edges
6. `AnalyticsService` - 16 edges
7. `FeedService` - 16 edges
8. `MigrationService` - 16 edges
9. `SPW_Sync` - 16 edges
10. `WebmasterService` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Smart Property Widget Sync Plugin` --calls--> `API Component (NestJS)`  [EXTRACTED]
  packages/wp-plugin/readme.txt → DEPLOYMENT.md

## Communities

### Community 0 - "Dashboard UI Components"
Cohesion: 0.03
Nodes (10): fetchData(), handleCreate(), handleDelete(), handleUpdate(), resetForm(), addToRemoveQueue(), dispatch(), genId() (+2 more)

### Community 1 - "Database Entities"
Cohesion: 0.03
Nodes (48): Favorite, PropertyView, SavedSearch, SearchLog, AuditLog, Contact, CreateFeatureDto, CreateLocationDto (+40 more)

### Community 2 - "Property & Label Controllers"
Cohesion: 0.03
Nodes (13): AppModule, JwtAuthGuard, LabelController, LabelModule, LocationController, LocationModule, PropertyController, PropertyModule (+5 more)

### Community 3 - "Widget Components"
Cohesion: 0.05
Nodes (8): createElement(), deepMerge(), escapeHtml(), EventEmitter, isObject(), PropertyCard, PropertyDetail, ResultsGrid

### Community 4 - "Lead & Contact Management"
Cohesion: 0.06
Nodes (7): ContactController, ContactModule, InquiryController, LeadController, LeadModule, LeadScoringService, LeadService

### Community 5 - "Email Campaign System"
Cohesion: 0.06
Nodes (6): CampaignController, EmailConfigController, EmailTemplateController, EmailCampaignModule, EmailCampaignProcessor, EmailSenderService

### Community 6 - "Analytics Service"
Cohesion: 0.07
Nodes (5): AnalyticsController, FavoritesController, TrackingController, AnalyticsModule, AnalyticsService

### Community 7 - "Webmaster Management"
Cohesion: 0.06
Nodes (4): WebmasterAdminController, WebmasterController, WebmasterModule, WebmasterService

### Community 8 - "Upload Service"
Cohesion: 0.08
Nodes (4): StorageConfigController, UploadController, UploadModule, UploadService

### Community 9 - "Feed Adapters"
Cohesion: 0.09
Nodes (6): CreateFeedConfigDto, FeedConfig, FeedImportLog, InmobaAdapter, ResalesAdapter, UpdateFeedConfigDto

### Community 10 - "Super Admin Controllers"
Cohesion: 0.06
Nodes (3): RolesGuard, SuperAdminController, SuperAdminModule

### Community 11 - "Migration Service"
Cohesion: 0.1
Nodes (4): MigrationController, MigrationModule, MigrationProcessor, MigrationService

### Community 12 - "Ticket System"
Cohesion: 0.1
Nodes (4): SuperAdminTicketController, TicketController, TicketModule, TicketService

### Community 13 - "Feed Export Service"
Cohesion: 0.1
Nodes (4): FeedExportConfigController, FeedExportController, FeedExportModule, FeedExportService

### Community 14 - "Auth System"
Cohesion: 0.1
Nodes (4): AuthController, AuthModule, AuthService, JwtStrategy

### Community 15 - "Credit System"
Cohesion: 0.09
Nodes (5): CreditAdminController, CreditDashboardController, CreditWebmasterController, CreditModule, CreditService

### Community 16 - "Feed Import Service"
Cohesion: 0.1
Nodes (4): FeedController, FeedImportProcessor, FeedModule, FeedSchedulerService

### Community 17 - "Team Management"
Cohesion: 0.09
Nodes (3): TeamController, TeamModule, TeamService

### Community 18 - "Super Admin Service"
Cohesion: 0.11
Nodes (1): SuperAdminService

### Community 19 - "Reorder Service"
Cohesion: 0.11
Nodes (3): ReorderController, ReorderModule, ReorderService

### Community 20 - "Email Campaign Service"
Cohesion: 0.16
Nodes (1): EmailCampaignService

### Community 21 - "Feature Service"
Cohesion: 0.12
Nodes (3): FeatureController, FeatureModule, FeatureService

### Community 22 - "Widget Core"
Cohesion: 0.16
Nodes (1): SPWWidget

### Community 23 - "Property Type Service"
Cohesion: 0.14
Nodes (3): PropertyTypeController, PropertyTypeModule, PropertyTypeService

### Community 24 - "WP Sync Class"
Cohesion: 0.21
Nodes (1): SPW_Sync

### Community 25 - "Feed Service"
Cohesion: 0.23
Nodes (1): FeedService

### Community 26 - "License Service"
Cohesion: 0.18
Nodes (3): LicenseController, LicenseModule, LicenseService

### Community 27 - "Property Service"
Cohesion: 0.26
Nodes (1): PropertyService

### Community 28 - "Data Loader"
Cohesion: 0.26
Nodes (1): DataLoader

### Community 29 - "WP Plugin Core"
Cohesion: 0.18
Nodes (1): SPW_Sync_Plugin

### Community 30 - "WP Settings"
Cohesion: 0.15
Nodes (1): SPW_Settings

### Community 31 - "WP Webhook Handler"
Cohesion: 0.22
Nodes (1): SPW_Webhook

### Community 32 - "Contact Service"
Cohesion: 0.32
Nodes (1): ContactService

### Community 33 - "Location Service"
Cohesion: 0.27
Nodes (1): LocationService

### Community 34 - "Search Form"
Cohesion: 0.29
Nodes (1): SearchForm

### Community 35 - "WP OG Tags"
Cohesion: 0.35
Nodes (1): SPW_OG_Tags

### Community 36 - "Label Service"
Cohesion: 0.33
Nodes (1): LabelService

### Community 37 - "Tenant Service"
Cohesion: 0.31
Nodes (1): TenantService

### Community 38 - "Dashboard API Client"
Cohesion: 0.43
Nodes (6): apiDelete(), apiGet(), apiPatch(), apiPost(), apiPut(), apiRequest()

### Community 39 - "Deployment Architecture"
Cohesion: 0.38
Nodes (7): API Component (NestJS), Dashboard Component (Next.js), SPW v2 Deployment Guide, Widget CDN Component, Local JSON Caching Feature, Real-time Webhook Sync Feature, Smart Property Widget Sync Plugin

### Community 40 - "Contact DTOs"
Cohesion: 0.4
Nodes (3): CreateContactDto, PreferencesDto, UpdateContactDto

### Community 41 - "Team DTOs"
Cohesion: 0.4
Nodes (4): ChangePasswordDto, InviteUserDto, ResetPasswordDto, UpdateUserDto

### Community 42 - "Initial Schema Migration"
Cohesion: 0.5
Nodes (1): InitialSchema1712347200000

### Community 43 - "Core Features Migration"
Cohesion: 0.5
Nodes (1): CoreFeatures1712433600000

### Community 44 - "Feed Import Migration"
Cohesion: 0.5
Nodes (1): FeedImport1712520000000

### Community 45 - "Phase 2 Migration"
Cohesion: 0.5
Nodes (1): Phase2Features1712606400000

### Community 46 - "Role-Based Migration"
Cohesion: 0.5
Nodes (1): RoleBasedFeatures1712692800000

### Community 47 - "Analytics DTOs"
Cohesion: 0.5
Nodes (3): TrackInquiryDto, TrackSearchDto, TrackViewDto

### Community 48 - "Credit DTOs"
Cohesion: 0.5
Nodes (3): AdjustCreditDto, ConsumeCreditDto, PurchaseCreditDto

### Community 49 - "Property Type DTOs"
Cohesion: 0.5
Nodes (2): CreatePropertyTypeDto, UpdatePropertyTypeDto

### Community 50 - "Client Update DTOs"
Cohesion: 0.5
Nodes (3): ExtendSubscriptionDto, ManualActivationDto, UpdateClientDto

### Community 51 - "Time Entry DTOs"
Cohesion: 0.5
Nodes (3): CreateTimeEntryDto, QueryTimeEntriesDto, UpdateTimeEntryDto

### Community 52 - "HTTP Exception Filter"
Cohesion: 0.67
Nodes (1): HttpExceptionFilter

### Community 53 - "Tenant Guard"
Cohesion: 0.67
Nodes (1): TenantGuard

### Community 54 - "Transform Interceptor"
Cohesion: 0.67
Nodes (1): TransformInterceptor

### Community 55 - "Login DTOs"
Cohesion: 0.67
Nodes (2): LoginDto, LoginResponseDto

### Community 56 - "Campaign DTOs"
Cohesion: 0.67
Nodes (2): CreateCampaignDto, UpdateCampaignDto

### Community 57 - "Email Config DTOs"
Cohesion: 0.67
Nodes (2): CreateEmailConfigDto, UpdateEmailConfigDto

### Community 58 - "Template DTOs"
Cohesion: 0.67
Nodes (2): CreateTemplateDto, UpdateTemplateDto

### Community 59 - "Reorder DTOs"
Cohesion: 0.67
Nodes (2): ReorderDto, ReorderItemDto

### Community 60 - "Message DTOs"
Cohesion: 0.67
Nodes (2): AttachmentDto, CreateMessageDto

### Community 61 - "Storage Config DTOs"
Cohesion: 0.67
Nodes (2): CreateStorageConfigDto, UpdateStorageConfigDto

### Community 62 - "Roles & Permissions"
Cohesion: 0.67
Nodes (0): 

### Community 63 - "Admin Scripts"
Cohesion: 1.0
Nodes (2): fallbackCopy(), showCopied()

### Community 64 - "Rebuild Scripts"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Register DTO"
Cohesion: 1.0
Nodes (1): RegisterDto

### Community 66 - "Feed Export Config DTO"
Cohesion: 1.0
Nodes (1): UpdateFeedExportConfigDto

### Community 67 - "Create Label DTO"
Cohesion: 1.0
Nodes (1): CreateLabelDto

### Community 68 - "Update Label DTO"
Cohesion: 1.0
Nodes (1): UpdateLabelDto

### Community 69 - "Create Activity DTO"
Cohesion: 1.0
Nodes (1): CreateActivityDto

### Community 70 - "Create Lead DTO"
Cohesion: 1.0
Nodes (1): CreateLeadDto

### Community 71 - "Update Lead DTO"
Cohesion: 1.0
Nodes (1): UpdateLeadDto

### Community 72 - "License Validation DTO"
Cohesion: 1.0
Nodes (1): ValidateLicenseDto

### Community 73 - "Migration DTO"
Cohesion: 1.0
Nodes (1): StartMigrationDto

### Community 74 - "Create Client DTO"
Cohesion: 1.0
Nodes (1): CreateClientDto

### Community 75 - "License Key DTO"
Cohesion: 1.0
Nodes (1): GenerateLicenseKeyDto

### Community 76 - "Query Clients DTO"
Cohesion: 1.0
Nodes (1): QueryClientsDto

### Community 77 - "Create Ticket DTO"
Cohesion: 1.0
Nodes (1): CreateTicketDto

### Community 78 - "Update Ticket DTO"
Cohesion: 1.0
Nodes (1): UpdateTicketDto

### Community 79 - "PM2 Ecosystem Config"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Port Fix Script"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Restart Test Script"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Tenant Decorator"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "User Decorator"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Database Config"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "JWT Config"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Redis Config"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Next.js Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Next.js Config"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "NextAuth Types"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Tenant Types"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Graphify Instructions"
Cohesion: 1.0
Nodes (1): Graphify Knowledge Graph Instructions

### Community 95 - "Server Requirements Doc"
Cohesion: 1.0
Nodes (1): Server Requirements

### Community 96 - "Node.js Requirement"
Cohesion: 1.0
Nodes (1): Node.js 20.x LTS Requirement

### Community 97 - "MySQL Requirement"
Cohesion: 1.0
Nodes (1): MySQL 8.0+ Requirement

### Community 98 - "Redis Requirement"
Cohesion: 1.0
Nodes (1): Redis 7.x Requirement

### Community 99 - "Nginx Requirement"
Cohesion: 1.0
Nodes (1): NGINX Reverse Proxy

### Community 100 - "PM2 Requirement"
Cohesion: 1.0
Nodes (1): PM2 Process Manager

### Community 101 - "Database Doc"
Cohesion: 1.0
Nodes (1): SPW V2 MySQL Database

### Community 102 - "OG Tags Feature"
Cohesion: 1.0
Nodes (1): OG Meta Tags Feature

### Community 103 - "HMAC Verification"
Cohesion: 1.0
Nodes (1): HMAC Signature Verification

## Knowledge Gaps
- **135 isolated node(s):** `AppModule`, `PropertyView`, `SearchLog`, `Favorite`, `SavedSearch` (+130 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Rebuild Scripts`** (2 nodes): `rebuild.php`, `runCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Register DTO`** (2 nodes): `register.dto.ts`, `RegisterDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Feed Export Config DTO`** (2 nodes): `feed-export-config.dto.ts`, `UpdateFeedExportConfigDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Label DTO`** (2 nodes): `create-label.dto.ts`, `CreateLabelDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Update Label DTO`** (2 nodes): `update-label.dto.ts`, `UpdateLabelDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Activity DTO`** (2 nodes): `create-activity.dto.ts`, `CreateActivityDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Lead DTO`** (2 nodes): `create-lead.dto.ts`, `CreateLeadDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Update Lead DTO`** (2 nodes): `update-lead.dto.ts`, `UpdateLeadDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `License Validation DTO`** (2 nodes): `validate-license.dto.ts`, `ValidateLicenseDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Migration DTO`** (2 nodes): `migration.dto.ts`, `StartMigrationDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Client DTO`** (2 nodes): `create-client.dto.ts`, `CreateClientDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `License Key DTO`** (2 nodes): `license-key.dto.ts`, `GenerateLicenseKeyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Query Clients DTO`** (2 nodes): `query-clients.dto.ts`, `QueryClientsDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Ticket DTO`** (2 nodes): `create-ticket.dto.ts`, `CreateTicketDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Update Ticket DTO`** (2 nodes): `update-ticket.dto.ts`, `UpdateTicketDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PM2 Ecosystem Config`** (1 nodes): `ecosystem.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Port Fix Script`** (1 nodes): `fix_port_and_restart.php`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Restart Test Script`** (1 nodes): `restart_and_test.php`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tenant Decorator`** (1 nodes): `tenant.decorator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User Decorator`** (1 nodes): `user.decorator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Config`** (1 nodes): `database.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `JWT Config`** (1 nodes): `jwt.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Redis Config`** (1 nodes): `redis.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Env Types`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Config`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NextAuth Types`** (1 nodes): `next-auth.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tenant Types`** (1 nodes): `tenant.types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Graphify Instructions`** (1 nodes): `Graphify Knowledge Graph Instructions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Requirements Doc`** (1 nodes): `Server Requirements`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Node.js Requirement`** (1 nodes): `Node.js 20.x LTS Requirement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `MySQL Requirement`** (1 nodes): `MySQL 8.0+ Requirement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Redis Requirement`** (1 nodes): `Redis 7.x Requirement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Nginx Requirement`** (1 nodes): `NGINX Reverse Proxy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PM2 Requirement`** (1 nodes): `PM2 Process Manager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Doc`** (1 nodes): `SPW V2 MySQL Database`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `OG Tags Feature`** (1 nodes): `OG Meta Tags Feature`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HMAC Verification`** (1 nodes): `HMAC Signature Verification`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SuperAdminService` connect `Super Admin Service` to `Super Admin Controllers`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `EmailCampaignService` connect `Email Campaign Service` to `Email Campaign System`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `AppModule`, `PropertyView`, `SearchLog` to the rest of the system?**
  _135 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Database Entities` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Property & Label Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Widget Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._