import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { DashboardEmptyState } from '~/components/ui';
import SettingsDialog from '~/components/Nav/Settings';

export default function SettingsLanding() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  return (
    <main className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto bg-surface-primary">
      <DashboardEmptyState
        icon={Settings}
        title={localize('com_ui_empty_settings_title')}
        description={localize('com_ui_empty_settings_desc')}
        ctaLabel={localize('com_ui_empty_settings_cta')}
        onCta={() => setOpen(true)}
        helpLabel={localize('com_ui_empty_settings_help')}
        helpHref="https://docs.xcity.ai/settings"
      />
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
