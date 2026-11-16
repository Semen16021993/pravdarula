import { Download, FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCS } from "@/lib/catalog";

export type CabinetSection = { label?: string; docs: string[] };

export function FileCabinet({ sections, onDocx, onPdf }: { sections: CabinetSection[]; onDocx: (id: string) => void; onPdf: (id: string) => void }) {
  let n = 0;
  return (
    <div className="cabinet">
      <div className="cabinet-head"><FolderOpen className="size-5" /> Картотека · ваше дело</div>
      <div className="space-y-6 p-4 md:p-6">
        {sections.filter((s) => s.docs.length).map((sec, si) => (
          <div key={si}>
            {sec.label && <div className="cabinet-divider">{sec.label}</div>}
            <ul className="space-y-0">
              {sec.docs.map((id) => {
                n += 1;
                return (
                  <li key={id} className="cabinet-folder">
                    <span className="cabinet-tab">№ {String(n).padStart(2, "0")}</span>
                    <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
                      <FileText className="size-7 shrink-0 text-primary" />
                      <h3 className="min-w-0 flex-1 text-lg font-bold">{DOCS[id]!.title}</h3>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => onDocx(id)}><Download /> DOCX</Button>
                        <Button size="sm" variant="outline" onClick={() => onPdf(id)}><Download /> PDF</Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
