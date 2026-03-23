import PlaceholderPage from '@/components/shared/PlaceholderPage';

export default function AdminPage() {
  return (
    <PlaceholderPage
      title="Admin center"
      description="The admin route now resolves correctly for privileged users. Existing admin sub-pages can be linked here as you expand the settings surface."
      primaryHref="/admin/integrations"
      primaryLabel="Open integrations"
    />
  );
}
