import { Plug } from 'lucide-react';
import { MCPIcon } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import { DashboardEmptyState } from '~/components/ui';
import { useLocalize, useHasAccess } from '~/hooks';
import MCPServerCard from './MCPServerCard';

interface MCPServerListProps {
  servers: MCPServerDefinition[];
  getServerStatusIconProps: (serverName: string) => MCPServerStatusIconProps;
  isFiltered?: boolean;
  onAdd?: () => void;
}

/**
 * Renders a list of MCP server cards with empty state handling
 */
export default function MCPServerList({
  servers,
  getServerStatusIconProps,
  isFiltered = false,
  onAdd,
}: MCPServerListProps) {
  const localize = useLocalize();
  const canCreateEditMCPs = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });

  if (servers.length === 0) {
    if (isFiltered) {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
            <MCPIcon className="size-5 text-text-secondary" aria-hidden="true" />
          </div>
          <p className="text-sm text-text-secondary">{localize('com_ui_no_mcp_servers_match')}</p>
        </div>
      );
    }
    return (
      <DashboardEmptyState
        icon={Plug}
        title={localize('com_ui_empty_integrations_title')}
        description={localize('com_ui_empty_integrations_desc')}
        ctaLabel={localize('com_ui_empty_integrations_cta')}
        onCta={onAdd}
        helpLabel={localize('com_ui_empty_integrations_help')}
        helpHref="https://docs.xcity.ai/integrations"
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label={localize('com_ui_mcp_servers')}>
      {servers.map((server) => (
        <div key={`card_${server.serverName}`} role="listitem">
          <MCPServerCard
            server={server}
            getServerStatusIconProps={getServerStatusIconProps}
            canCreateEditMCPs={canCreateEditMCPs}
          />
        </div>
      ))}
    </div>
  );
}
