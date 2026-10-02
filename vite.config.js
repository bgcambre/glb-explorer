import { defineConfig } from "vite";

// This app is served from a subdirectory — https://lacambre-3d.be/glb-explorer/ — not from the
// domain root, which belongs to a separate Quartz site. With Vite's default `base: "/"` the built
// index.html asks for /assets/index-*.js, which on that host is a 404, and a 404 is an HTML page:
// so the browser rejects the module on its MIME type ("text/html") rather than on its status,
// which is why the error names the MIME type and not the missing file.
//
// Relative rather than "/glb-explorer/" so the build carries no knowledge of where it is mounted:
// renaming the folder, or serving it from the root one day, then needs no rebuild and no config
// change. Safe here because this is a single page with no client-side routing — nothing is ever
// served at a deeper path for a relative URL to resolve against differently.
//
// It only fixes the URLs Vite itself writes (the module and the stylesheet in index.html). Paths
// fetched at runtime are not Vite's to see — see `asset()` in src/slideshow.js.
export default defineConfig({
  base: "./",
});
