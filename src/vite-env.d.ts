/// <reference types="vite/client" />

interface Window {
  toxity?: {
    getVersion: () => Promise<string>;
    platform: string;
  };
}
