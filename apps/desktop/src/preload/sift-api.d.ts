import type { SiftApi } from "@sift/ipc-contract";

declare global {
  interface Window {
    sift: SiftApi;
  }
}

export {};
