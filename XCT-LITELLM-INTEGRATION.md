# XCity AI / LiteLLM Integration Guide

## Overview

xct-chat is now configured to route all AI model requests through **tokenhub.xcity.one** (XCity's LiteLLM gateway) instead of connecting directly to individual providers. This provides:

- **Unified access** to all AI models (Tencent, OpenAI, Anthropic, Google, etc.)
- **Centralized billing and monitoring** through LiteLLM
- **Simplified configuration** - one API key for all models
- **Automatic model discovery** - models are fetched dynamically from LiteLLM

## Configuration

### 1. LibreChat Configuration (`librechat.yaml`)

A `librechat.yaml` file has been created with the XCity AI custom endpoint:

```yaml
endpoints:
  custom:
    - name: 'XCity AI'
      apiKey: '${LITELLM_API_KEY}'
      baseURL: 'https://tokenhub.xcity.one/v1'
      models:
        fetch: true  # Dynamically fetch models from LiteLLM
      titleConvo: true
      summarize: true
      dropParams:
        - user
      modelDisplayLabel: 'XCity AI'
```

**Note:** `librechat.yaml` is gitignored and should be created in production from this template.

### 2. Environment Variable

Add the following environment variable to your deployment:

```bash
LITELLM_API_KEY=<your-litellm-api-key>
```

This can be:
- A service-level API key for the backend
- Or a user-provided key if users have individual LiteLLM accounts

### 3. Railway Deployment

The `railway.env.template` has been updated with the LITELLM_API_KEY variable. To deploy:

1. **Create `librechat.yaml`** in your Railway deployment (via build step or manual upload)
2. **Set environment variable** in Railway Variables:
   - Variable name: `LITELLM_API_KEY`
   - Value: Your LiteLLM API key from tokenhub.xcity.one
3. **Deploy** the service

### 4. Local Development

For local development:

1. Copy the `librechat.yaml` (already created in this repo, though gitignored)
2. Add `LITELLM_API_KEY` to your `.env` file
3. Start the backend: `npm run backend:dev`
4. Start the frontend: `npm run frontend:dev`

## Verification

After deployment, verify the integration:

1. **Check model list**: Open xct-chat and check if all LiteLLM models appear in the model selector under "XCity AI"
   - Should see models from: Tencent, OpenAI, Anthropic, Google, etc.

2. **Test a conversation**: Select any model and send a test message
   - Response should be successful
   - Check that the request went through tokenhub.xcity.one (not direct to provider)

3. **Monitor LiteLLM**: Check the LiteLLM spend logs at tokenhub.xcity.one
   - All requests should appear in the logs
   - Billing should be tracked correctly

4. **Error handling**: If LiteLLM is unavailable
   - Should show a clear error message
   - No fallback to direct provider connections (unless configured)

## Architecture

```
User
  ↓
xct-chat (LibreChat)
  ↓
tokenhub.xcity.one (LiteLLM Gateway)
  ↓
├─→ Tencent (Hunyuan models)
├─→ OpenAI (GPT models)
├─→ Anthropic (Claude models)
└─→ Google (Gemini models)
```

## Model Discovery

Models are discovered automatically via the LiteLLM `/v1/models` endpoint:
- `GET https://tokenhub.xcity.one/v1/models`
- Returns all available models configured in LiteLLM
- LibreChat refreshes this list periodically

## Troubleshooting

### Models not appearing
- Check that `LITELLM_API_KEY` is set correctly
- Verify that `fetch: true` is set in `librechat.yaml`
- Check backend logs for API errors

### Authentication errors
- Verify the API key is valid and not expired
- Check that the key has access to the required models

### Request failures
- Check LiteLLM service status at tokenhub.xcity.one
- Verify network connectivity from your deployment
- Check LibreChat logs for detailed error messages

## Files Modified

- ✅ `librechat.yaml` - Created with XCity AI endpoint configuration
- ✅ `.env.example` - Added `LITELLM_API_KEY` documentation
- ✅ `railway.env.template` - Added `LITELLM_API_KEY` variable
- ✅ `XCT-LITELLM-INTEGRATION.md` - This documentation file

## Content Creation (Image & Video)

Both image and video generation route through the same gateway virtual key, so
per-plan model access + budgets apply automatically.

### Image
Built-in `image_gen_oai` / `image_edit_oai` agent tools call
`POST {IMAGE_GEN_OAI_BASEURL}/images/generations`. Point them at the gateway and
set the model:

```bash
IMAGE_GEN_OAI_API_KEY=${LITELLM_API_KEY}
IMAGE_GEN_OAI_BASEURL=https://tokenhub.xcity.one/v1
IMAGE_GEN_OAI_MODEL=gpt-image-1   # or the Dreamina/Seedance image id
```

This is a **single-model** tool: choosing the seedance image id replaces
`gpt-image-1` for this tool. Also verify the gpt-image-specific params
(`background`, `quality`, `size`) are tolerated by the model on the gateway.

### Video
The fork adds a native `video_gen` agent tool (see `FORK-CHANGES.md §3`) that
calls the gateway's video API (`create → poll → retrieve`) and returns the clip
as an inline video attachment. Enable it with:

```bash
VIDEO_GEN_API_KEY=${LITELLM_API_KEY}
VIDEO_GEN_BASEURL=https://tokenhub.xcity.one/v1
VIDEO_GEN_MODEL=dreamina-seedance-2-0-260128
# VIDEO_GEN_CREATE_PATH=/videos   # override if the gateway path differs
```

**Phase-0 verification (before production):** confirm the model's mode and
request/response contract on the live gateway:

```bash
curl -s https://tokenhub.xcity.one/v1/model/info \
  -H "Authorization: Bearer $LITELLM_API_KEY" \
  | jq '.data[] | select(.model_name|test("seedance|dreamina"))'
```

If the video endpoint path or job-status shape differs from the OpenAI-style
`/videos` default, override `VIDEO_GEN_CREATE_PATH` — the tool's response
parsing already tolerates the common sync/async envelopes.

### Can xct-home use the model?
Yes, provided (1) the model is in the `model_access` list for the virtual keys
xct-home uses, and (2) xct-home either deep-links into an xct-chat agent that
carries `video_gen`/`image_gen_oai` (recommended — keeps media billing through
tokenhub) or calls the gateway endpoints directly.

## Related Documentation

- [LibreChat Custom Endpoints](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints)
- [LiteLLM Documentation](https://docs.litellm.ai/)
- [XCity Auth Integration](./XCT-AUTH-CHAT-INTEGRATION.md)
