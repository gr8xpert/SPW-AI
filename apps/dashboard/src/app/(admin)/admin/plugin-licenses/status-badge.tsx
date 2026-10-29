import { Badge } from '@/components/ui/badge';
import { LicenseStatus } from './types';

export function StatusBadge({ status }: { status: LicenseStatus }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>;
  if (status === 'revoked') return <Badge variant="destructive">Revoked</Badge>;
  return <Badge variant="warning">Expired</Badge>;
}
