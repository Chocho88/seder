/// <reference types="vite/client" />

declare module '*.svg' {
  const src: string;
  export default src;
}

// build stamp injected by vite.config.ts define
declare const __SEDER_BUILD__: string;
