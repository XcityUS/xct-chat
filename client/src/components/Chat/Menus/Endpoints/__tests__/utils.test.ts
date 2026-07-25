import { filterItems, filterChatMappedEndpoints, filterChatModelSpecs } from '../utils';
import type { TModelSpec } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import type { useLocalize } from '~/hooks';

jest.mock('../components/SpecIcon', () => ({
  __esModule: true,
  default: () => null,
}));

const agentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  showMarketplace: true,
  searchAliases: ['agent marketplace', 'marketplace'],
};

const disabledAgentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: false,
  icon: null,
};

const agentsEndpointWithModels: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  models: [{ name: 'agent-1' }, { name: 'agent-2' }],
  agentNames: { 'agent-1': 'Agent One', 'agent-2': 'Agent Two' },
  modelIcons: { 'agent-1': '/agent-1.png', 'agent-2': '/agent-2.png' },
};

const agentSpec = {
  name: 'agent-spec',
  label: 'Agent Spec',
  preset: { endpoint: 'agents', agent_id: 'agent-1' },
} as TModelSpec;

const modelSpec = {
  name: 'model-spec',
  label: 'Model Spec',
  preset: { endpoint: 'openAI', model: 'gpt-4o-mini' },
} as TModelSpec;

const unavailableModelSpec = {
  name: 'unavailable-model-spec',
  label: 'Unavailable Model Spec',
  preset: { endpoint: 'openAI', model: 'gpt-4o' },
} as TModelSpec;

const modelsConfig = {
  openAI: ['gpt-4o-mini'],
};

describe('model selector utilities', () => {
  it('matches endpoint search aliases', () => {
    const results = filterItems([agentsEndpoint], 'marketplace', undefined, undefined);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('matches localized Marketplace labels', () => {
    const localize = ((key: string) => {
      if (key === 'com_agents_marketplace') {
        return 'Tienda de Agentes';
      }
      if (key === 'com_ui_marketplace') {
        return 'Tienda';
      }
      return key;
    }) as ReturnType<typeof useLocalize>;

    const results = filterItems([agentsEndpoint], 'tienda', undefined, undefined, localize);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('does not match agents when there are no selectable agent options', () => {
    const results = filterItems([disabledAgentsEndpoint], 'my agents', undefined, undefined);
    expect(results).toEqual([]);
  });

  it('keeps the Agents endpoint with the full accessible list in the picker', () => {
    // No agent selected — the user can still browse and pick their agents.
    expect(filterChatMappedEndpoints([agentsEndpointWithModels], 'openAI', undefined)).toEqual([
      agentsEndpointWithModels,
    ]);
    // Selected agent already in the list — list stays intact.
    expect(filterChatMappedEndpoints([agentsEndpointWithModels], 'agents', 'agent-2')).toEqual([
      agentsEndpointWithModels,
    ]);
  });

  it('injects a deep-linked agent that is outside the accessible list', () => {
    const [result] = filterChatMappedEndpoints(
      [agentsEndpointWithModels],
      'agents',
      'agent_public-xyz',
    );
    expect(result.models).toEqual([
      { name: 'agent-1' },
      { name: 'agent-2' },
      { name: 'agent_public-xyz' },
    ]);
  });

  it('hides the Agents section only when it is empty and nothing is selected', () => {
    const emptyAgentsEndpoint: Endpoint = { ...agentsEndpointWithModels, models: [] };
    expect(filterChatMappedEndpoints([emptyAgentsEndpoint], 'openAI', undefined)).toEqual([]);
    // Empty list but a deep-linked agent → section appears with just that agent.
    const [result] = filterChatMappedEndpoints([emptyAgentsEndpoint], 'agents', 'agent-9');
    expect(result.models).toEqual([{ name: 'agent-9' }]);
  });

  it('keeps permission-filtered agent model specs selectable at all times', () => {
    expect(filterChatModelSpecs([agentSpec, modelSpec], modelsConfig, 'openAI', undefined)).toEqual(
      [agentSpec, modelSpec],
    );
    expect(filterChatModelSpecs([agentSpec, modelSpec], modelsConfig, 'agents', 'agent-1')).toEqual(
      [agentSpec, modelSpec],
    );
  });

  it('hides model specs whose model is unavailable to the user', () => {
    expect(
      filterChatModelSpecs([modelSpec, unavailableModelSpec], modelsConfig, 'openAI', undefined),
    ).toEqual([modelSpec]);
  });
});
