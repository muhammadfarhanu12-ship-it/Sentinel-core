/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_API_WS_URL?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  // Backwards-compatible name used by some pages.
  readonly VITE_WS_URL?: string;
  readonly VITE_ADMIN_API_BASE_URL?: string;
  readonly VITE_ENABLE_SOCIAL_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
