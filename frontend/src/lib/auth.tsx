import { useQuery } from '@tanstack/react-query';
import { api, Me } from './api';

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/auth/me').catch(() => null),
    staleTime: 60_000,
    retry: false,
  });
}
