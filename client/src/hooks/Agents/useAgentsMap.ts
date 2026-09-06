import { useMemo } from 'react';
import { PermissionBits } from 'librechat-data-provider';
import type { TAgentsMap } from 'librechat-data-provider';
import { useGetStartupConfig, useListAgentsQuery } from '~/data-provider';
import { mapAgents, isAgentsInterfaceEnabled } from '~/utils';

export default function useAgentsMap({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): TAgentsMap | undefined {
  const { data: startupConfig } = useGetStartupConfig();
  const agentsInterfaceEnabled =
    startupConfig != null && isAgentsInterfaceEnabled(startupConfig.interface);
  const { data: mappedAgents = null } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW },
    {
      select: (res) => mapAgents(res.data),
      enabled: isAuthenticated && agentsInterfaceEnabled,
    },
  );

  const agentsMap = useMemo<TAgentsMap | undefined>(() => {
    return mappedAgents !== null ? mappedAgents : undefined;
  }, [mappedAgents]);

  return agentsMap;
}
