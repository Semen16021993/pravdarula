import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Constructor } from "@/components/constructor/Constructor";
import { Onboarding } from "@/components/constructor/Onboarding";
import { Login } from "@/components/constructor/Login";
import { isProjectPreview, PREVIEW_USER } from "@/lib/preview-mode";

type CurrentUser = { id: string; email: string };

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
  component: DocumentEntry,
});

function DocumentEntry() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [started, setStarted] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (isProjectPreview(window.location.hostname)) {
      setPreview(true);
      setUser(PREVIEW_USER);
      setStarted(true);
      return;
    }
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось проверить авторизацию.");
        return response.json();
      })
      .then((data: { user?: CurrentUser | null }) => {
        if (active) setUser(data.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (user === undefined) return <div className="min-h-screen" />;
  if (!user) return <Login />;
  return started
    ? <Constructor userId={user.id} email={user.email} preview={preview} onIntroduction={() => setStarted(false)} />
    : <Onboarding onComplete={() => { window.scrollTo(0, 0); setStarted(true); }} />;
}
