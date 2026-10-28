import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import type { ApiKeyScope, ApiKeySettings } from '@spm/shared';

// Extra website keys (2026-10-28). The client's main key stays on
// tenants.apiKeyHash and shows everything; each key here is for another
// website and carries a scope the API enforces on every public query, e.g. a
// Marbella-only new-build site.
@Entity('api_keys')
@Index('idx_api_keys_tenant', ['tenantId'])
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column({ length: 100 })
  name: string;

  // sha256 of the raw key, like tenants.apiKeyHash. The raw key is shown once.
  @Column({ type: 'char', length: 64, unique: true })
  keyHash: string;

  @Column({ type: 'char', length: 4 })
  last4: string;

  @Column({ type: 'json', nullable: true })
  scope: ApiKeyScope | null;

  // Hosts the key works on, subdomains included (e.g. "example.com").
  // Empty or null = any site.
  @Column({ type: 'json', nullable: true })
  allowedDomains: string[] | null;

  // How the website looks with this key, over the client's Settings.
  @Column({ type: 'json', nullable: true })
  settings: ApiKeySettings | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastUsedOrigin: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
