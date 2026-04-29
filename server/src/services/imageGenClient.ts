import { assertImageEnv, env } from "../config/env.js";

export class ImageGenError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

export type ImageGenerateInput = {
  prompt: string;
  /** Up to 10 reference images (URLs) for style / character consistency. */
  referenceImageUrls?: string[];
};

type ProviderResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

/**
 * SeeDream / getimg-style POST .../images/generations with optional `images: [{url}]` array.
 * Adjust request shape if your provider uses different field names.
 */
export async function callImageGeneration(
  input: ImageGenerateInput,
): Promise<{ imageUrl?: string; b64Json?: string }> {
  assertImageEnv();
  const endpoint = `${env.imageApiBaseUrl}/images/generations`;
  const body: Record<string, unknown> = {
    model: env.imageModel,
    prompt: input.prompt,
    aspect_ratio: env.imageAspectRatio,
    resolution: env.imageResolution,
    output_format: env.imageOutputFormat,
  };
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    if (input.referenceImageUrls.length > 10) {
      throw new ImageGenError(400, "INVALID_INPUT", "At most 10 reference images");
    }
    body.images = input.referenceImageUrls.map((url) => ({ url: url.trim() }));
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.imageApiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: ProviderResponse;
  try {
    json = JSON.parse(raw) as ProviderResponse;
  } catch {
    throw new ImageGenError(
      502,
      "UPSTREAM",
      `Image API did not return JSON: ${raw.slice(0, 500)}`,
    );
  }
  if (!res.ok) {
    const msg =
      json.error?.message ?? json.message ?? res.statusText ?? "Image API error";
    throw new ImageGenError(res.status, "IMAGE_API", msg);
  }
  const first = json.data?.[0];
  if (!first) {
    throw new ImageGenError(502, "EMPTY", "Image API returned no data[] entry");
  }
  return { imageUrl: first.url, b64Json: first.b64_json };
}
