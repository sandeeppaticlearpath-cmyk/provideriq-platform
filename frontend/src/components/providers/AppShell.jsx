'use client';

import { usePathname } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

const PUBLIC_PATHS = ['/', '/auth/login'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_PATHS.includes(pathname);

  if (isPublicRoute) {
    return children;
  }

  return <AppLayout>{children}</AppLayout>;
}
