import { useId, useState, type ReactNode } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCS } from "@/lib/catalog";
import { DOCUMENT_DETAILS } from "@/lib/document-details";
import { cn } from "@/lib/utils";

export function DocumentCard({ id, children, compact = false, recommended = false }: {
  id: string; children?: ReactNode; compact?: boolean; recommended?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const descriptionId = useId();
  const doc = DOCS[id];
  const details = DOCUMENT_DETAILS[id];
  if (!doc || !details) return null;

  return (
    <article className={cn("document-card", compact && "document-card-compact")} data-flipped={flipped}>
      <div className="document-card-turn">
        <div className={cn("document-card-front rounded-3xl border bg-card shadow-soft", recommended && "border-2 border-accent")} aria-hidden={flipped} inert={flipped}>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {!compact && <div className="flex flex-wrap gap-2">
              {recommended && <span className="chip-accent">Рекомендуем: у вас нет материалов дела</span>}
              <span className="text-xs font-bold uppercase text-muted-foreground">{doc.kind === "kit" ? "Комплект образцов" : "DOCX с вашими данными"}</span>
            </div>}
            <h3 className={cn("font-bold", compact ? "text-sm" : "mt-1 text-lg")}>
              <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-md p-0 text-left font-serif text-inherit hover:bg-transparent hover:text-primary" aria-label={`Подробнее: ${doc.title}`} aria-expanded={flipped} aria-controls={descriptionId} onClick={() => setFlipped(true)}>
                <span className="min-w-0">{doc.title}</span><Info className="document-card-hint shrink-0 text-primary size-5" />
              </Button>
            </h3>
            {!compact && <p className="mt-1 text-sm text-muted-foreground">{doc.purpose}</p>}
          </div>
          {children && <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-end">{children}</div>}
        </div>
        <div className="document-card-back rounded-3xl border border-primary/40 bg-secondary" aria-hidden={!flipped} inert={!flipped}>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-primary/20 pb-2">
            <p className="min-w-0 text-sm font-bold text-heading">{doc.title}</p>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Вернуться: ${doc.title}`} title="Вернуться к документу" onClick={() => setFlipped(false)}><ArrowLeft /></Button>
          </div>
          <div id={descriptionId} tabIndex={flipped ? 0 : -1} role="region" aria-label={`Описание: ${doc.title}`} className="document-card-description mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-3 text-sm leading-relaxed" onKeyDown={(event) => { if (event.key === "Escape") setFlipped(false); }}>
            {([["Что это за документ", details.what], ["Зачем он нужен", details.why], ["Когда используется", details.when], ["Как использовать", details.how]] as const).map(([title, text]) => <section key={title} className="mb-3"><h4 className="font-bold text-heading">{title}</h4><p className="mt-1">{text}</p></section>)}
          </div>
        </div>
      </div>
    </article>
  );
}