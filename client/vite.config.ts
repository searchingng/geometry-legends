import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const DEV_SERVER = "http://localhost:2567";
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  server: {
    proxy: { "/api/admin": DEV_SERVER },
  },
  build: {
    rollupOptions: {
      input: { main: page("index.html"), admin: page("admin.html") },
    },
  },
});
