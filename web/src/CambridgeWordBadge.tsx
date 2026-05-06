import { cambridgeLabelText, lookupCambridgeWord } from "./cambridgeLookup";

type Props = {
  word: string;
};

/** Badge for Cambridge level (Movers/KET/PET). */
export function CambridgeWordBadge({ word }: Props) {
  const b = lookupCambridgeWord(word);
  if (b === "Movers") {
    return (
      <span className="vfinal-cam vfinal-cam--movers" title="剑桥词表：Movers">
        Movers
      </span>
    );
  }
  if (b === "KET") {
    return (
      <span className="vfinal-cam vfinal-cam--ket" title="剑桥词表：KET">
        KET
      </span>
    );
  }
  if (b === "PET") {
    return (
      <span className="vfinal-cam vfinal-cam--pet" title="剑桥词表：PET">
        PET
      </span>
    );
  }
  return (
    <span className="vfinal-cam vfinal-cam--na" title="剑桥词表未收录">
      {cambridgeLabelText(word)}
    </span>
  );
}
