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
    <div className="min-w-0 space-y-8">
      {sections.filter((s) => s.docs.length).map((sec, si) => (
        <div key={si}>
          {sec.label && <p className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{sec.label}</p>}
          <ul className="wallet">
            {sec.docs.map((id) => {
              n += 1;
              const active = open === id;
               const doc = DOCS[id];
               if (!doc) return null;
               return (
                <li key={id} className="wallet-card" data-tone={n % 4} data-open={active}>
                  <Button variant="ghost" className="wallet-toggle grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-2 rounded-md p-0 text-left text-inherit hover:bg-transparent hover:text-inherit" aria-label={doc.title} aria-expanded={active} onClick={() => setOpen(active ? null : id)}>
                    <span className="wallet-num shrink-0">№ {String(n).padStart(2, "0")}</span>
                    <span className="min-w-0 truncate text-base font-bold sm:text-lg">{doc.title}</span>
                    <ChevronDown className="wallet-chevron size-5 shrink-0 transition-transform" />
                  </Button>
                  <div className="wallet-body">
                    <FileText className="size-10 opacity-90" />
                    <h3 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">{doc.title}</h3>
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
