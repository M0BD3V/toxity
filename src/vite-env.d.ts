/// <reference types="vite/client" />

type ToxityScreenSource = { id: string; name: string; thumbnail: string };

interface Window {
  toxity?: {
    getVersion: () => Promise<string>;
    platform: string;
    listScreenSources: () => Promise<ToxityScreenSource[]>;
    selectScreenSource: (sourceId: string) => Promise<void>;
  };
}

interface Window {
  toxity?: {
    getVersion: () => Promise<string>;
    platform: string;
  };
}
