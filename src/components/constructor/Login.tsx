import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getTestLoginCode } from "@/lib/test-login.functions";

export function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testCode, setTestCode] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await getTestLoginCode({ data: { email: email.trim() } });
      setTestCode(r.code); setSent(true);
    } catch { setError("Не удалось получить код. Проверьте адрес почты."); }
    setBusy(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("Код неверный или устарел. Запросите новый.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md">
        <span className="block font-serif text-2xl font-bold text-heading">Право Руля</span>
        <span className="text-xs text-muted-foreground">личный кабинет · ст. 12.27 ч. 2</span>
        {!sent ? (
          <form onSubmit={send} className="mt-6">
            <h1 className="text-2xl font-bold">Вход в личный кабинет</h1>
            <p className="mt-2 text-sm text-muted-foreground">Здесь хранятся ваша анкета и купленные документы — их можно скачать заново в любой момент или докупить новые.</p>
            <Label htmlFor="email" className="mt-5 block font-bold text-heading">Электронная почта</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.ru" className="mt-1.5 bg-background" />
            {error && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}><Mail /> {busy ? "Отправляем…" : "Получить код"}</Button>
            <p className="mt-3 text-xs text-muted-foreground">Пароль не нужен: на почту придёт одноразовый код.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6">
            <h1 className="text-2xl font-bold">Введите код из письма</h1>
            <p className="mt-2 text-sm text-muted-foreground">Код для <b>{email}</b>. Пока почта не подключена, он показан ниже.</p>
            {testCode && <div className="mt-4 rounded-xl border border-dashed border-accent bg-accent/15 p-3 text-center text-sm"><span className="block text-xs text-muted-foreground">Тестовый режим — код вместо письма:</span><b className="text-2xl tracking-[0.3em] text-heading">{testCode}</b></div>}
            <Label htmlFor="code" className="mt-5 block font-bold text-heading">Код</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-1.5 bg-background text-center text-2xl tracking-[0.4em]" />
            {error && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || code.length < 6}>{busy ? "Проверяем…" : "Войти"}</Button>
            <button type="button" className="mt-3 flex items-center gap-1 text-sm text-muted-foreground underline" onClick={() => { setSent(false); setCode(""); setError(""); }}><ArrowLeft className="size-4" /> Другая почта / отправить ещё раз</button>
          </form>
        )}
      </div>
    </div>
  );
}
