import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Constructor } from "@/components/constructor/Constructor";
import { Onboarding } from "@/components/constructor/Onboarding";
import { Login } from "@/components/constructor/Login";

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
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") setStarted(false);
    });
    supabase.auth.getSession().then(({ data: d }) => setUser(d.session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (user === undefined) return <div className="min-h-screen" />;
  if (!user) return <Login />;
  return started
    ? <Constructor userId={user.id} email={user.email ?? ""} />
    : <Onboarding onComplete={() => { window.scrollTo(0, 0); setStarted(true); }} />;
}
