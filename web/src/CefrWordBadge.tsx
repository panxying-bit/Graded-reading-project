import { lookupCefrWord } from "./cefrLookup";

type Props = {
  word: string;
  /** When `level4`, A2/B1 are visually emphasized; A1 is shown as non-core. */
  levelId?: string;
};

/**
 * CEFR band badge for vocabulary tables (lookup against bundled A1/A2/B1 lists).
 */
export function CefrWordBadge({ word, levelId }: Props) {
  const b = lookupCefrWord(word);
  const l4 = levelId === "level4";
  if (b === "A1") {
    return (
      <span
        className={`vfinal-cefr ${l4 ? "vfinal-cefr--a1-l4" : "vfinal-cefr--a1"}`}
        title={
          l4
            ? "CEFR A1：Level 4 不作为核心教词，优先选 A2 / B1"
            : "CEFR 欧框：A1（内置词表）"
        }
      >
        A1
      </span>
    );
  }
  if (b === "A2") {
    return (
      <span
        className={`vfinal-cefr vfinal-cefr--a2${l4 ? " vfinal-cefr--l4-core" : ""}`}
        title={
          l4
            ? "CEFR A2（Level 4 核心教词带）"
            : "CEFR 欧框：A2（内置词表）"
        }
      >
        A2
      </span>
    );
  }
  if (b === "B1") {
    return (
      <span
        className={`vfinal-cefr vfinal-cefr--b1${l4 ? " vfinal-cefr--l4-core" : ""}`}
        title={
          l4
            ? "CEFR B1（Level 4 核心教词带）"
            : "CEFR 欧框：B1（内置词表）"
        }
      >
        B1
      </span>
    );
  }
  return (
    <span
      className="vfinal-cefr vfinal-cefr--na"
      title="A1/A2/B1 词表中无完全一致的词头（小写、去首尾空格；多词需与表中整段一致）"
    >
      未收录
    </span>
  );
}
