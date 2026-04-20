/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3" {
  export const env: any;
  export const pipeline: any;
}
