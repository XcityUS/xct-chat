const { logger } = require('@librechat/data-schemas');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { fetchAgentModelIds } = require('~/server/services/litellmSource');

// Custom endpoint (librechat.yaml `endpoints.custom[].name`) that fronts the
// LiteLLM gateway. LiteLLM A2A agents are not returned by `/v1/models`, so they
// must be appended here for deep-linked `a2a/*` models to be selectable.
const AGENTS_ENDPOINT_NAME = process.env.LITELLM_AGENTS_ENDPOINT_NAME || 'XCity AI';

/**
 * Append LiteLLM A2A agents as `a2a/<agent_name>` models to the XCity AI
 * endpoint. Fail-safe: any problem leaves modelsConfig untouched.
 */
async function injectAgentModels(modelsConfig) {
  try {
    const existing = modelsConfig[AGENTS_ENDPOINT_NAME];
    if (!Array.isArray(existing)) {
      return modelsConfig;
    }
    const agentModels = await fetchAgentModelIds();
    if (agentModels.length) {
      // De-dupe in case the gateway ever surfaces an agent in /v1/models too.
      modelsConfig[AGENTS_ENDPOINT_NAME] = [...new Set([...existing, ...agentModels])];
    }
  } catch (error) {
    logger.warn(`[ModelController] injectAgentModels failed: ${error.message}`);
  }
  return modelsConfig;
}

const getModelsConfig = (req) => loadModels(req);

async function loadModels(req) {
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);
  const modelsConfig = { ...defaultModelsConfig, ...customModelsConfig };
  return injectAgentModels(modelsConfig);
}

async function modelController(req, res) {
  try {
    const modelConfig = await loadModels(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
