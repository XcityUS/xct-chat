/**
 * @jest-environment jsdom
 */
import { LocalStorageKeys } from 'librechat-data-provider';
import { createProviderOption, getDefaultAgentFormValues } from './forms';

describe('forms utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults new agents to DeepSeek-V4-flash on XCity AI when nothing is stored', () => {
    const defaults = getDefaultAgentFormValues();

    expect(defaults.model).toBe('deepseek-v4-flash');
    expect(defaults.provider).toEqual(createProviderOption('XCity AI'));
  });

  it('prefers stored agent model and provider values over defaults', () => {
    localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, 'gpt-4o-mini');
    localStorage.setItem(LocalStorageKeys.LAST_AGENT_PROVIDER, 'openai');

    const defaults = getDefaultAgentFormValues();

    expect(defaults.model).toBe('gpt-4o-mini');
    expect(defaults.provider).toEqual(createProviderOption('openai'));
  });
});
