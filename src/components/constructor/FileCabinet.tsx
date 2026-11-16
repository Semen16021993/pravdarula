import { useState } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCS } from "@/lib/catalog";

export type CabinetSection = { label?: string; docs: string[] };

/** Стопка карточек в стиле Apple Wallet: видны верхушки, нажатая карточка выезжает целиком. */
export function FileCabinet({ sections, onDocx, onPdf }: { sections: CabinetSection[]; onDocx: (id: string) => void; onPdf: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  let n = 0;
  return (
    <div className="space-y-8">
      {sections.filter((s) => s.docs.length).map((sec, si) => (
        <div key={si}>
          {sec.label && <p className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{sec.label}</p>}
          <ul className="wallet">
            {sec.docs.map((id) => {
              n += 1;
              const active = open === id;
              return (
                <li key={id} className="wallet-card" data-tone={n % 4} data-open={active}>
                  <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={active} onClick={() => setOpen(active ? null : id)}>
                    <span className="wallet-num">№ {String(n).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[1.05rem] font-bold">{DOCS[id]!.title}</span>
                    <ChevronDown className="size-5 shrink-0 transition-transform" style={{ transform: active ? "rotate(180deg)" : undefined }} />
                  </button>
                  <div className="wallet-body">
                    <FileText className="size-10 opacity-90" />
                    <h3 className="mt-3 text-[1.65rem] font-bold leading-snug">{DOCS[id]!.title}</h3>
                        <div className="mt-6 flex flex-wrap gap-2">
                          <Button variant="secondary" onClick={() => onDocx(id)}><Download /> DOCX</Button>
                          <Button variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => onPdf(id)}><Download /> PDF</Button>
                        </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
