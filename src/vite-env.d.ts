/// <reference types="vite/client" />

type ToxityScreenSource = { id: string; name: string; thumbnail: string };

interface Window {
  toxity?: {
    getVersion: () => Promise<string>;
    platform: string;
    listScreenSources: () => Promise<ToxityScreenSource[]>;
    selectScreenSource: (sourceId: string) => Promise<void>;
    getActivity: () => Promise<{ focused: boolean; visible: boolean; idleSeconds: number }>;
  };
}

interface Window {
  toxity?: {
    getVersion: () => Promise<string>;
    platform: string;
  };
}
