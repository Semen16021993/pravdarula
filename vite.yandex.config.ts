// Static SPA build for Yandex Cloud Object Storage + API Gateway.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: { define: { "import.meta.env.VITE_PREVIEW_DEMO": JSON.stringify("false") } },
  tanstackStart: {
    spa: { enabled: true },
    server: { entry: "server" },
  },
});
