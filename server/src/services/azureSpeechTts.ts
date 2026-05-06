/**
 * Azure Cognitive Services — Text-to-Speech (neural) via regional REST endpoint.
 * Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech
 */

const MAX_TTS_CHARS = 600;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function assertSafeVoiceName(name: string): string {
  const t = name.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(t) || t.length > 80) {
    throw new Error("Invalid AZURE_SPEECH_VOICE");
  }
  return t;
}

/**
 * Returns MP3 bytes (16 kHz mono, 128 kbps) for the given English text.
 */
export async function synthesizeAzureSpeechToMp3(options: {
  text: string;
  subscriptionKey: string;
  region: string;
  /** e.g. en-US-JennyNeural */
  voiceName: string;
}): Promise<Buffer> {
  const text = options.text.trim().slice(0, MAX_TTS_CHARS);
  if (!text) {
    throw new Error("Empty text for TTS");
  }
  const region = options.region.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(region) || region.length > 32) {
    throw new Error("Invalid speech region");
  }
  const voice = assertSafeVoiceName(options.voiceName);
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const inner = escapeXml(text);
  const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice}">${inner}</voice>
</speak>`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": options.subscriptionKey.trim(),
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      "User-Agent": "graded-reading-platform/1.0",
    },
    body: ssml,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Azure TTS HTTP ${res.status}: ${body.slice(0, 400)}`,
    );
  }

  return Buffer.from(await res.arrayBuffer());
}
