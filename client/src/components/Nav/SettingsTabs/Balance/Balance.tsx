import React from 'react';
import { Coins } from 'lucide-react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { DashboardEmptyState } from '~/components/ui';
import { useAuthContext, useLocalize } from '~/hooks';
import TokenCreditsItem from './TokenCreditsItem';
import AutoRefillSettings from './AutoRefillSettings';

function Balance() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  const balanceData = balanceQuery.data;

  // Pull out all the fields we need, with safe defaults
  const {
    tokenCredits = 0,
    autoRefillEnabled = false,
    lastRefill,
    refillAmount,
    refillIntervalUnit,
    refillIntervalValue,
  } = balanceData ?? {};

  // Check that all auto-refill props are present
  const hasValidRefillSettings =
    lastRefill !== undefined &&
    refillAmount !== undefined &&
    refillIntervalUnit !== undefined &&
    refillIntervalValue !== undefined;

  if (!balanceQuery.isLoading && balanceData && tokenCredits === 0 && !autoRefillEnabled) {
    return (
      <DashboardEmptyState
        icon={Coins}
        title={localize('com_ui_empty_billing_title')}
        description={localize('com_ui_empty_billing_desc')}
        ctaLabel={localize('com_ui_empty_billing_cta')}
        helpLabel={localize('com_ui_empty_billing_help')}
        helpHref="https://xcity.ai/pricing"
        onCta={() => window.open('https://xcity.ai/pricing', '_blank', 'noopener,noreferrer')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Token credits display */}
      <TokenCreditsItem tokenCredits={tokenCredits} />

      {/* Auto-refill display */}
      {autoRefillEnabled ? (
        hasValidRefillSettings ? (
          <AutoRefillSettings
            lastRefill={lastRefill}
            refillAmount={refillAmount}
            refillIntervalUnit={refillIntervalUnit}
            refillIntervalValue={refillIntervalValue}
          />
        ) : (
          <div className="text-sm text-red-600">
            {localize('com_nav_balance_auto_refill_error')}
          </div>
        )
      ) : (
        <div className="text-sm text-gray-600">
          {localize('com_nav_balance_auto_refill_disabled')}
        </div>
      )}
    </div>
  );
}

export default React.memo(Balance);
