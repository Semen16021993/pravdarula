import { createServerFn } from "@tanstack/react-start";

// ВРЕМЕННЫЙ тестовый вход: пока не подключён почтовый домен, код показывается на экране, а не в письме.
export const getTestLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => {
    const email = String(d?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error("bad email");
    return { email };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.createUser({ email: data.email, email_confirm: true }).catch(() => null);
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: data.email });
    if (error || !link?.properties?.email_otp) throw new Error("Не удалось создать код");
    return { code: link.properties.email_otp };
  });
