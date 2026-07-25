import React from 'react';
import { Bot } from 'lucide-react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type {
  TModelSpec,
  TAgentsMap,
  TModelsConfig,
  TAssistantsMap,
  TEndpointsConfig,
} from 'librechat-data-provider';
import type { useLocalize } from '~/hooks';
import SpecIcon from './components/SpecIcon';
import { Endpoint, SelectedValues } from '~/common';

export function filterItems<
  T extends {
    label: string;
    name?: string;
    value?: string;
    hasModels?: boolean;
    models?: Array<{ name: string; isGlobal?: boolean }>;
    searchAliases?: string[];
    showMarketplace?: boolean;
  },
>(
  items: T[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
  localize?: ReturnType<typeof useLocalize>,
): T[] | null {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return null;
  }

  return items.filter((item) => {
    if (!shouldRenderEndpointOption(item)) {
      return false;
    }

    const itemMatches =
      item.label.toLowerCase().includes(searchTermLower) ||
      (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
      (item.value && item.value.toLowerCase().includes(searchTermLower)) ||
      item.searchAliases?.some((alias) => alias.toLowerCase().includes(searchTermLower)) ||
      (item.showMarketplace === true &&
        localize != null &&
        [localize('com_agents_marketplace'), localize('com_ui_marketplace')].some((label) =>
          label.toLowerCase().includes(searchTermLower),
        ));

    if (itemMatches) {
      return true;
    }

    if (item.models && item.models.length > 0) {
      return item.models.some((modelId) => {
        if (modelId.name.toLowerCase().includes(searchTermLower)) {
          return true;
        }

        if (isAgentsEndpoint(item.value) && agentsMap && modelId.name in agentsMap) {
          const agentName = agentsMap[modelId.name]?.name;
          return typeof agentName === 'string' && agentName.toLowerCase().includes(searchTermLower);
        }

        if (isAssistantsEndpoint(item.value) && assistantsMap) {
          const endpoint = item.value ?? '';
          const assistant = assistantsMap[endpoint][modelId.name];
          if (assistant && typeof assistant.name === 'string') {
            return assistant.name.toLowerCase().includes(searchTermLower);
          }
          return false;
        }

        return false;
      });
    }

    return false;
  });
}

export function shouldRenderEndpointOption(endpoint: {
  value?: string;
  hasModels?: boolean;
}): boolean {
  return !isAgentsEndpoint(endpoint.value) || endpoint.hasModels === true;
}

export function filterModels(
  endpoint: Endpoint,
  models: string[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
): string[] {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return models;
  }

  return models.filter((modelId) => {
    let modelName = modelId;

    if (isAgentsEndpoint(endpoint.value) && agentsMap && agentsMap[modelId]) {
      modelName = agentsMap[modelId]?.name || modelId;
    } else if (
      isAssistantsEndpoint(endpoint.value) &&
      assistantsMap &&
      assistantsMap[endpoint.value]
    ) {
      const assistant = assistantsMap[endpoint.value][modelId];
      modelName =
        typeof assistant.name === 'string' && assistant.name ? (assistant.name as string) : modelId;
    }

    return modelName.toLowerCase().includes(searchTermLower);
  });
}

export function filterChatModelSpecs(
  modelSpecs: TModelSpec[],
  modelsConfig: TModelsConfig | undefined,
  endpoint: string | null | undefined,
  agent_id: string | null | undefined,
): TModelSpec[] {
  return modelSpecs.filter((spec) => {
    const specEndpoint = spec.preset?.endpoint;
    if (isAgentsEndpoint(specEndpoint)) {
      return isAgentsEndpoint(endpoint) && !!agent_id && spec.preset?.agent_id === agent_id;
    }

    if (isAssistantsEndpoint(specEndpoint)) {
      return true;
    }

    if (!specEndpoint) {
      return false;
    }

    const availableModels = modelsConfig?.[specEndpoint] ?? [];
    const specModel = spec.preset?.model;
    return availableModels.length > 0 && (!specModel || availableModels.includes(specModel));
  });
}

export function filterChatMappedEndpoints(
  mappedEndpoints: Endpoint[],
  endpoint: string | null | undefined,
  agent_id: string | null | undefined,
): Endpoint[] {
  const hasSelectedAgent = isAgentsEndpoint(endpoint) && !!agent_id;

  return mappedEndpoints.flatMap((mappedEndpoint) => {
    if (!isAgentsEndpoint(mappedEndpoint.value)) {
      return [mappedEndpoint];
    }

    if (!hasSelectedAgent) {
      return [];
    }

    const selectedAgent = mappedEndpoint.models?.find((model) => model.name === agent_id);
    if (!selectedAgent) {
      return [];
    }

    const selectedAgentName = mappedEndpoint.agentNames?.[agent_id];
    const selectedAgentIcon = mappedEndpoint.modelIcons?.[agent_id];
    return [
      {
        ...mappedEndpoint,
        models: [selectedAgent],
        agentNames: selectedAgentName != null ? { [agent_id]: selectedAgentName } : undefined,
        modelIcons:
          mappedEndpoint.modelIcons != null ? { [agent_id]: selectedAgentIcon } : undefined,
      },
    ];
  });
}

export function getSelectedIcon({
  mappedEndpoints,
  selectedValues,
  modelSpecs,
  endpointsConfig,
}: {
  mappedEndpoints: Endpoint[];
  selectedValues: SelectedValues;
  modelSpecs: TModelSpec[];
  endpointsConfig: TEndpointsConfig;
}): React.ReactNode | null {
  const { endpoint, model, modelSpec } = selectedValues;

  if (modelSpec) {
    const spec = modelSpecs.find((s) => s.name === modelSpec);
    if (!spec) {
      return null;
    }
    const { showIconInHeader = true } = spec;
    if (!showIconInHeader) {
      return null;
    }
    return React.createElement(SpecIcon, {
      currentSpec: spec,
      endpointsConfig,
    });
  }

  if (endpoint && model) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    if (!selectedEndpoint) {
      return null;
    }

    if (selectedEndpoint.modelIcons?.[model]) {
      const iconUrl = selectedEndpoint.modelIcons[model];
      return React.createElement(
        'div',
        { className: 'h-5 w-5 overflow-hidden rounded-full' },
        React.createElement('img', {
          src: iconUrl,
          alt: model,
          className: 'h-full w-full object-cover',
        }),
      );
    }

    return (
      selectedEndpoint.icon ||
      React.createElement(Bot, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      })
    );
  }

  if (endpoint) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    return selectedEndpoint?.icon || null;
  }

  return null;
}

export const getDisplayValue = ({
  localize,
  mappedEndpoints,
  selectedValues,
  modelSpecs,
  agentsMap,
}: {
  localize: ReturnType<typeof useLocalize>;
  selectedValues: SelectedValues;
  mappedEndpoints: Endpoint[];
  modelSpecs: TModelSpec[];
  agentsMap?: TAgentsMap;
}) => {
  if (selectedValues.modelSpec) {
    const spec = modelSpecs.find((s) => s.name === selectedValues.modelSpec);
    return spec?.label || spec?.name || localize('com_ui_select_model');
  }

  if (selectedValues.model && selectedValues.endpoint) {
    const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
    if (!endpoint) {
      return localize('com_ui_select_model');
    }

    if (
      isAgentsEndpoint(endpoint.value) &&
      endpoint.agentNames &&
      endpoint.agentNames[selectedValues.model]
    ) {
      return endpoint.agentNames[selectedValues.model];
    } else if (isAgentsEndpoint(endpoint.value) && agentsMap) {
      const agent = agentsMap[selectedValues.model];
      return agent?.name || selectedValues.model;
    }

    if (
      isAssistantsEndpoint(endpoint.value) &&
      endpoint.assistantNames &&
      endpoint.assistantNames[selectedValues.model]
    ) {
      return endpoint.assistantNames[selectedValues.model];
    }

    return selectedValues.model;
  }

  if (selectedValues.endpoint) {
    const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
    return endpoint?.label || localize('com_ui_select_model');
  }

  return localize('com_ui_select_model');
};
