import { useEffect, useRef, useState } from "react";
import { getTtsEnabled } from "./api/client";
import { getOrFetchTtsUrl } from "./ttsAudioCache";

type Props = {
  text: string;
  className?: string;
  /** Button face when idle (short label works across fonts/OS). */
  label?: string;
  disabled?: boolean;
};

export function TtsPlayButton({
  text,
  className,
  label = "听",
  disabled,
}: Props) {
  const [gateReady, setGateReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTtsEnabled().then((ok) => {
      if (!cancelled) {
        setEnabled(ok);
        setGateReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  const play = async () => {
    const t = text.trim();
    if (!t || disabled || loading || !enabled) {
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const url = await getOrFetchTtsUrl(t);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setLoading(false);
      };
      await audio.play();
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!text.trim()) {
    return null;
  }

  const unconfiguredTitle =
    "语音未启用：在项目根目录或 server 目录的 .env 中设置 AZURE_SPEECH_KEY（Azure 语音资源密钥），可选 AZURE_SPEECH_REGION，保存后重启后端。";

  if (!gateReady) {
    return (
      <span className="tts-play-wrap">
        <button
          type="button"
          className={`tts-play-btn tts-play-btn--pending${className ? ` ${className}` : ""}`}
          disabled
          title="正在检查语音服务…"
          aria-hidden
        >
          …
        </button>
      </span>
    );
  }

  if (!enabled) {
    return (
      <span className="tts-play-wrap">
        <button
          type="button"
          className={`tts-play-btn tts-play-btn--unconfigured${className ? ` ${className}` : ""}`}
          disabled
          title={unconfiguredTitle}
          aria-label="语音未配置"
        >
          听
        </button>
      </span>
    );
  }

  return (
    <span className="tts-play-wrap">
      <button
        type="button"
        className={`tts-play-btn${className ? ` ${className}` : ""}`}
        onClick={() => void play()}
        disabled={disabled || loading}
        title="朗读本句/本词"
        aria-label="朗读"
      >
        {loading ? "…" : label}
      </button>
      {err ? (
        <span className="tts-play-err" role="status">
          {err}
        </span>
      ) : null}
    </span>
  );
}
