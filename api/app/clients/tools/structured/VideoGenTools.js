const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Tool } = require('@librechat/agents/langchain/tools');
const { applyAxiosProxyConfig } = require('@librechat/api');
const { ContentTypes } = require('librechat-data-provider');

const videoGenJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description:
        'Detailed description of the video to generate. Describe the scene, subject, motion, camera movement, lighting, and mood. Use positive, descriptive language.',
    },
    seconds: {
      type: 'number',
      description:
        'Desired length of the clip in seconds (e.g. 5). Optional; the model applies its default when omitted.',
    },
    size: {
      type: 'string',
      description:
        'Target frame size in pixels, e.g. "1280x720" (landscape), "720x1280" (portrait), or "1024x1024" (square). Optional.',
    },
    input_reference: {
      type: 'string',
      description:
        'Optional URL of a reference image to animate (image-to-video). When provided, the video is generated from this still image guided by the prompt.',
    },
  },
  required: ['prompt'],
};

const displayMessage =
  "The tool generated a video, which is already displayed to the user. Don't repeat a detailed description of it. Do not list download links; the video is available in the UI, where the user can play or download it.";

const SUCCESS_STATUSES = new Set([
  'completed',
  'complete',
  'succeeded',
  'success',
  'ready',
  'done',
  'finished',
]);
const FAILURE_STATUSES = new Set([
  'failed',
  'error',
  'errored',
  'cancelled',
  'canceled',
  'rejected',
]);

/**
 * Extracts a status string from a variety of job-response envelopes.
 * @param {Object} body
 * @returns {string}
 */
function extractStatus(body) {
  const raw =
    body?.status ??
    body?.state ??
    body?.data?.status ??
    body?.data?.state ??
    body?.result?.status ??
    '';
  return typeof raw === 'string' ? raw.toLowerCase() : '';
}

/**
 * Extracts a job id from a create-response envelope.
 * @param {Object} body
 * @returns {string|undefined}
 */
function extractJobId(body) {
  return (
    body?.id ??
    body?.task_id ??
    body?.job_id ??
    body?.data?.id ??
    body?.data?.task_id ??
    body?.result?.id ??
    body?.request_id
  );
}

/**
 * Pulls a playable video URL (or a base64 data URL) out of a response envelope,
 * tolerating the several shapes different providers expose behind the gateway.
 * @param {Object} body
 * @returns {string|undefined}
 */
function extractVideoUrl(body) {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const first = Array.isArray(body.data) ? body.data[0] : undefined;
  const b64 = first?.b64_json ?? body.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return `data:video/mp4;base64,${b64}`;
  }
  const candidates = [
    // LiteLLM-normalized OpenAI VideoObject (BytePlus/seedance): the completed
    // status response carries the playable URL on `output_url`.
    body.output_url,
    // Raw BytePlus passthrough shape: { status, content: { video_url } }.
    body.content?.video_url,
    body.content?.url,
    first?.url,
    typeof first?.video_url === 'string' ? first.video_url : first?.video_url?.url,
    body.url,
    typeof body.video_url === 'string' ? body.video_url : body.video_url?.url,
    typeof body.output === 'string' ? body.output : body.output?.url,
    Array.isArray(body.output) ? (body.output[0]?.url ?? body.output[0]) : undefined,
    body.result?.url,
    typeof body.result?.video_url === 'string'
      ? body.result.video_url
      : body.result?.video_url?.url,
    body.video?.url,
    body.assets?.video,
    Array.isArray(body.assets) ? body.assets[0]?.url : undefined,
  ];
  return candidates.find((value) => typeof value === 'string' && value.length > 0);
}

/**
 * VideoGenTool — generates video from a text prompt (or a reference image) via
 * the XCity LiteLLM gateway. The gateway normalizes provider-specific video
 * models (e.g. Dreamina/Seedance) behind an OpenAI-style video endpoint. The
 * create call may return a finished asset synchronously or an async job that
 * must be polled until completion.
 *
 * Agent-only (like the OpenAI image tools): returns a `content_and_artifact`
 * tuple whose artifact carries a VIDEO_URL part, which the agent callback
 * persists as a video file attachment.
 */
class VideoGenTool extends Tool {
  constructor(fields = {}) {
    super();

    /** @type {boolean} Allows startup instantiation without credentials. */
    this.override = fields.override ?? false;
    /** @type {boolean} */
    this.isAgent = fields.isAgent ?? false;
    if (!this.override && !this.isAgent) {
      throw new Error('This tool is only available for agents.');
    }
    if (this.isAgent) {
      /** Maps the [content, artifact] tuple to ToolMessage fields. */
      this.responseFormat = 'content_and_artifact';
    }

    this.apiKey = fields.VIDEO_GEN_API_KEY ?? this.getApiKey();
    this.model = process.env.VIDEO_GEN_MODEL || 'dreamina-seedance-2-0-260128';
    this.baseUrl = (process.env.VIDEO_GEN_BASEURL || 'https://tokenhub.xcity.one/v1').replace(
      /\/+$/,
      '',
    );
    this.createPath = process.env.VIDEO_GEN_CREATE_PATH || '/videos';
    this.pollIntervalMs = Number(process.env.VIDEO_GEN_POLL_INTERVAL_MS) || 3000;
    this.maxWaitMs = Number(process.env.VIDEO_GEN_MAX_WAIT_MS) || 5 * 60 * 1000;
    this.requestTimeoutMs = Number(process.env.VIDEO_GEN_REQUEST_TIMEOUT_MS) || 60 * 1000;

    this.name = 'video_gen';
    this.description =
      'Generate a short video from a text prompt (optionally animating a reference image). Each call produces one video clip. Use for requests to create, animate, or render a video/clip/motion scene.';
    this.description_for_model =
      "// Turn the user's idea into a vivid, specific video prompt: describe subject, setting, motion, camera movement, lighting, and mood in 2-4 sentences. Provide `input_reference` (an image URL) to animate an existing image (image-to-video). Generation can take up to a few minutes.";
    this.schema = videoGenJsonSchema;
  }

  static get jsonSchema() {
    return videoGenJsonSchema;
  }

  getApiKey() {
    const apiKey = process.env.VIDEO_GEN_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing VIDEO_GEN_API_KEY environment variable.');
    }
    return apiKey;
  }

  getAxiosConfig(signal) {
    const config = {
      timeout: this.requestTimeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    if (signal) {
      config.signal = signal;
    }
    return applyAxiosProxyConfig(config, this.baseUrl);
  }

  /** @param {Object|string} value */
  getDetails(value) {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  returnValue(value) {
    if (typeof value === 'string') {
      return [value, {}];
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [displayMessage, value];
  }

  /**
   * Resolves once `ms` has elapsed, or rejects immediately if the run is aborted.
   * @param {number} ms
   * @param {AbortSignal} [signal]
   */
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Video generation aborted'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('Video generation aborted'));
          },
          { once: true },
        );
      }
    });
  }

  buildPayload({ prompt, seconds, size, input_reference }) {
    // OpenAI-compatible video-create params (LiteLLM /v1/videos normalizes these
    // to the provider, e.g. BytePlus/Seedance: seconds→duration, size→ratio,
    // input_reference→image content part).
    const payload = { model: this.model, prompt };
    if (seconds != null) {
      payload.seconds = seconds;
    }
    if (size) {
      payload.size = size;
    }
    if (input_reference) {
      payload.input_reference = input_reference;
    }
    return payload;
  }

  /**
   * Polls the async job until it reaches a terminal state or the wait budget
   * is exhausted, then resolves the playable video URL.
   * @param {string} jobId
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>}
   */
  async pollForVideo(jobId, signal) {
    const statusUrl = `${this.baseUrl}${this.createPath}/${jobId}`;
    const deadline = Date.now() + this.maxWaitMs;

    while (Date.now() < deadline) {
      await this.sleep(this.pollIntervalMs, signal);
      const { data } = await axios.get(statusUrl, this.getAxiosConfig(signal));
      const status = extractStatus(data);

      if (FAILURE_STATUSES.has(status)) {
        throw new Error(`Video job ${jobId} ${status || 'failed'}`);
      }

      const url = extractVideoUrl(data);
      if (url) {
        return url;
      }
      if (SUCCESS_STATUSES.has(status)) {
        return this.fetchContentUrl(jobId, signal);
      }
    }
    throw new Error(`Video job ${jobId} did not complete within ${this.maxWaitMs}ms`);
  }

  /**
   * Fallback when a completed job carries no URL: download the binary from the
   * `/content` sub-resource and return it as a base64 data URL.
   * @param {string} jobId
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>}
   */
  async fetchContentUrl(jobId, signal) {
    const contentUrl = `${this.baseUrl}${this.createPath}/${jobId}/content`;
    const response = await axios.get(contentUrl, {
      ...this.getAxiosConfig(signal),
      responseType: 'arraybuffer',
    });
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers?.['content-type'] || 'video/mp4';
    return `data:${contentType};base64,${base64}`;
  }

  async _call(data, _runManager, config) {
    const signal = config?.signal;
    if (!data.prompt) {
      throw new Error('Missing required field: prompt');
    }

    const createUrl = `${this.baseUrl}${this.createPath}`;
    const payload = this.buildPayload(data);

    let createResponse;
    try {
      createResponse = await axios.post(createUrl, payload, this.getAxiosConfig(signal));
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      logger.error('[VideoGenTool] Error while submitting video job:', details);
      return this.returnValue(
        `Something went wrong when trying to generate the video. The video service may be unavailable.\nError Message: ${details}`,
      );
    }

    let videoUrl;
    try {
      videoUrl = extractVideoUrl(createResponse.data);
      if (!videoUrl) {
        const jobId = extractJobId(createResponse.data);
        if (!jobId) {
          logger.error('[VideoGenTool] No video URL or job id in response:', createResponse.data);
          return this.returnValue('No video data was returned from the video service.');
        }
        videoUrl = await this.pollForVideo(jobId, signal);
      }
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      logger.error('[VideoGenTool] Error while resolving video:', details);
      return this.returnValue(
        `An error occurred while generating the video.\nError Message: ${details}`,
      );
    }

    const file_ids = [uuidv4()];
    const content = [
      {
        type: ContentTypes.VIDEO_URL,
        video_url: { url: videoUrl },
      },
    ];
    const response = [
      {
        type: ContentTypes.TEXT,
        text: `${displayMessage}\n\ngenerated_video_id: "${file_ids[0]}"`,
      },
    ];
    return [response, { content, file_ids }];
  }
}

module.exports = VideoGenTool;
