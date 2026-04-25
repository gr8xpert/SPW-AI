import { useSelector } from './useStore';
import { selectors } from '@/core/selectors';

export function useConfig() {
  return useSelector(selectors.getConfig);
}
