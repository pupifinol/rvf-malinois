import { PlaceholderPage } from '@/components/shell/PlaceholderPage';

export default function Page() {
  return (
    <PlaceholderPage
      title="Sensors"
      phase="Phase F3"
      description="SignalFire mesh health: battery, RF, hops, last report. Critical for distinguishing 'sensor dead' from 'well dead' (UI/UX §11)."
    />
  );
}
