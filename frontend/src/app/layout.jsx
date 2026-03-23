import './globals.css';
import AppProviders from '@/components/providers/AppProviders';
import AppShell from '@/components/providers/AppShell';

export const metadata = {
  title: 'ProviderIQ',
  description: 'Healthcare staffing intelligence platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
