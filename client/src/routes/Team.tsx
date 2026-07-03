import { Users } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { DashboardEmptyState } from '~/components/ui';

export default function TeamPage() {
  const localize = useLocalize();
  return (
    <main className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto bg-surface-primary">
      <DashboardEmptyState
        icon={Users}
        title={localize('com_ui_empty_team_title')}
        description={localize('com_ui_empty_team_desc')}
        ctaLabel={localize('com_ui_empty_team_cta')}
        helpLabel={localize('com_ui_empty_team_help')}
        helpHref="https://docs.xcity.ai/team"
        onCta={() => window.open('mailto:?subject=Join+me+on+Xcity+Chat', '_blank')}
      />
    </main>
  );
}
