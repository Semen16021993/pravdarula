import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (sendError) throw sendError;
      setEmail(normalizedEmail);
      setSent(true);
    } catch {
      setError("Не удалось отправить код. Проверьте адрес почты и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (verifyError) throw verifyError;
    } catch {
      setError("Код неверный или устарел. Запросите новый.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md">
        <span className="block font-serif text-2xl font-bold text-heading">Право Руля</span>
        <span className="text-xs text-muted-foreground">личный кабинет · ст. 12.27 ч. 2</span>
        {!sent ? (
          <form onSubmit={send} className="mt-6">
            <h1 className="text-2xl font-bold">Вход в личный кабинет</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Здесь хранятся ваша анкета и купленные документы — их можно скачать заново в любой
              момент или докупить новые.
            </p>
            <Label htmlFor="email" className="mt-5 block font-bold text-heading">
              Электронная почта
            </Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.ru"
              className="mt-1.5 bg-background"
            />
            {error && (
              <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
              <Mail /> {busy ? "Отправляем…" : "Получить код"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              На вашу почту придёт одноразовый код для входа.
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6">
            <h1 className="text-2xl font-bold">Введите код из письма</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Мы отправили одноразовый код на <b>{email}</b>. Проверьте входящие и папку «Спам».
            </p>
            <Label htmlFor="code" className="mt-5 block font-bold text-heading">
              Код
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="mt-1.5 bg-background text-center text-2xl tracking-[0.4em]"
            />
            {error && (
              <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="mt-5 w-full"
              disabled={busy || code.length < 6}
            >
              {busy ? "Проверяем…" : "Войти"}
            </Button>
            <button
              type="button"
              className="mt-3 flex items-center gap-1 text-sm text-muted-foreground underline"
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
              }}
            >
              <ArrowLeft className="size-4" /> Изменить адрес / запросить новый код
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
