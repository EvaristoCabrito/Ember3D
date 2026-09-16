import { useState } from "react";
import { Button } from "@/components/ui/button";
import { portraitFor } from "./assets";
import type { DialogTree } from "./types";

/** The Battle Dialog System's runtime popup — shared by the mission intro/outro and every
 * NPC conversation. Always starts at `tree.startId`; a plain line advances via its own
 * `next` (an "Ok" button), a branching line shows one button per reply, each with its own
 * `next`. Either ends the tree (closes the popup) when the line/reply it followed has no
 * `next`. No click-outside-to-dismiss — same as the chest-loot/promotion popups, a
 * conversation only advances when the player deliberately presses a button. */
export function DialogOverlay({ tree, onClose }: { tree: DialogTree; onClose: () => void }) {
  const [lineId, setLineId] = useState(tree.startId);
  const line = tree.lines.find((l) => l.id === lineId);
  // Missing line id (a hand-edited/corrupt tree) closes rather than soft-locking the battle.
  if (!line) {
    onClose();
    return null;
  }
  const advance = (next: string | null | undefined) => {
    if (!next) {
      onClose();
      return;
    }
    setLineId(next);
  };
  const portrait = line.portrait ? portraitFor(line.portrait) : null;
  return (
    <div className="absolute inset-0 z-50 ember-veil flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-xl ember-window rounded-xl p-5 flex gap-4">
        {portrait && (
          <img
            src={portrait.src}
            alt=""
            className={portrait.framed ? "h-24 w-20 object-cover rounded-lg border border-border shrink-0" : "h-20 w-20 object-contain shrink-0"}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">{line.speaker}</p>
          <p className="mt-1 text-base leading-relaxed text-fg whitespace-pre-line">{line.text}</p>
          <div className="mt-4 flex flex-col gap-2">
            {line.replies && line.replies.length > 0 ? (
              line.replies.map((reply, i) => (
                <Button key={i} variant="quiet" className="w-full text-left justify-start" onClick={() => advance(reply.next)}>
                  {reply.text}
                </Button>
              ))
            ) : (
              <Button className="w-full" onClick={() => advance(line.next)}>
                {line.next ? "Próximo" : "Ok"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
