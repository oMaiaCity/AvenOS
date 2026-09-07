

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.6yLVkUID.js","_app/immutable/chunks/BzqGBSpB.js","_app/immutable/chunks/C8WBPWZ5.js","_app/immutable/chunks/xihTtKlq.js","_app/immutable/chunks/BO21OWZY.js","_app/immutable/chunks/gJRYCMHS.js","_app/immutable/chunks/Dy7YHh1y.js","_app/immutable/chunks/CZikjivo.js"];
export const stylesheets = ["_app/immutable/assets/0.BNVcY4Eq.css"];
export const fonts = [];
