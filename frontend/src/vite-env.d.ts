/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_API_WS_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_ADMIN_API_BASE_URL?: string;
  readonly VITE_ADMIN_APP_ORIGIN?: string;
  readonly VITE_ENABLE_SOCIAL_AUTH?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
