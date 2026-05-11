import fs from "node:fs";
import { resolveServerConfigFile } from "../utils/resolveConfigPath.js";

let cached: string | null = null;

function templatePath(): string {
  return resolveServerConfigFile(
    import.meta.url,
    "content-brief-ideas-prompt.md",
  );
}

export function buildContentBriefIdeasUserMessage(opts: {
  levelLabel: string;
  cefr: string;
  lessonLine: string;
  topic: string;
  lessonTitle: string;
  fictionOrNonfiction: string;
  structureType: string;
  genreLine: string;
  tenseLine: string;
  countMin: number;
  countMax: number;
}): string {
  if (!cached) {
    cached = fs.readFileSync(templatePath(), "utf8");
  }
  return cached
    .replaceAll("{{levelLabel}}", opts.levelLabel)
    .replaceAll("{{cefr}}", opts.cefr)
    .replaceAll("{{lessonLine}}", opts.lessonLine)
    .replaceAll("{{topic}}", opts.topic)
    .replaceAll("{{lessonTitle}}", opts.lessonTitle)
    .replaceAll("{{fictionOrNonfiction}}", opts.fictionOrNonfiction)
    .replaceAll("{{structureType}}", opts.structureType)
    .replaceAll("{{genreLine}}", opts.genreLine)
    .replaceAll("{{tenseLine}}", opts.tenseLine)
    .replaceAll("{{countMin}}", String(opts.countMin))
    .replaceAll("{{countMax}}", String(opts.countMax));
}
