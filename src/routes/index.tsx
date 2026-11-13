import { createFileRoute } from "@tanstack/react-router";
import { Constructor } from "@/components/constructor/Constructor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Конструктор документов по ст. 12.27 ч. 2 — Право Руля" },
      { name: "description", content: "Документы для ГИБДД и суда по ч. 2 ст. 12.27 КоАП РФ: отдельные шаблоны или комплекс с Roadmap и инструкцией." },
      { property: "og:title", content: "Конструктор документов — Право Руля" },
      { property: "og:description", content: "Заполните анкету один раз и получите готовые документы для ГИБДД и суда." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Constructor,
});
