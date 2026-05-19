import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Trends"
      phase="Phase F4"
      description="Multivariable historical trends backed by TimescaleDB continuous aggregates. Server-side downsampling — never raw points for long ranges."
    />
  );
}
