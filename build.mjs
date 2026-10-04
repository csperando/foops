// Builds the publishable bundles into dist/ (or the directory given as the
// first argument):
//   foops.esm.js  ES module, for bundlers and `import`
//   foops.min.js  minified IIFE exposing window.foops, for a <script> tag
//   server.js     ES module of foops/server, for Node
import { build } from "esbuild";

const outdir = process.argv[2] || "dist";
const common = { bundle: true, sourcemap: true, target: "es2020", logLevel: "warning" };

await Promise.all([
    build({ ...common, entryPoints: ["scripts/lib/index.js"], format: "esm", outfile: `${outdir}/foops.esm.js` }),
    build({ ...common, entryPoints: ["scripts/lib/index.js"], format: "iife", globalName: "foops", minify: true, outfile: `${outdir}/foops.min.js` }),
    build({ ...common, entryPoints: ["scripts/lib/server.js"], format: "esm", platform: "neutral", outfile: `${outdir}/server.js` })
]);
