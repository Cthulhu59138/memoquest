import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const bundledPackages = ["react", "react-dom", "scheduler", "dexie", "ts-fsrs", "zod", "lucide-react"];
const notices = [];
for (const name of bundledPackages) {
  const folder = `node_modules/${name}`;
  const metadata = JSON.parse(await readFile(`${folder}/package.json`, "utf8"));
  notices.push(`${name} ${metadata.version} (${metadata.license})\n${await readFile(`${folder}/LICENSE`, "utf8")}`);
}
await writeFile("dist/licenses.txt", notices.join("\n\n" + "=".repeat(72) + "\n\n"));

await mkdir("dist/icons", { recursive: true });
const icon = await readFile("public/favicon.svg");
for (const size of [192, 512]) await sharp(icon).resize(size, size).png().toFile(`dist/icons/icon-${size}.png`);
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#6c57e5" } })
  .composite([{ input: await sharp(icon).resize(310, 310).png().toBuffer(), gravity: "center" }])
  .png().toFile("dist/icons/maskable-512.png");

async function filesIn(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesIn(`${dir}/${entry.name}`, `${relative}/`));
    else if (!["sw.js", ".nojekyll", "build.json"].includes(relative)) files.push(relative);
  }
  return files.sort();
}
const files = await filesIn("dist");
const digest = createHash("sha256");
digest.update(await readFile("scripts/build-pwa.mjs"));
for (const file of files) digest.update(file).update(await readFile(`dist/${file}`));
const version = digest.digest("hex").slice(0, 16);
const precache = ["/", ...files.filter((f) => f !== "index.html").map((f) => `/${f}`)];
const worker = `// Generated from the complete build: ${version}
const CACHE = "memoquest-shell-${version}";
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE))));
self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting(); });
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("memoquest-shell-") && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const key = event.request.mode === "navigate" && url.pathname === "/" ? "/" : event.request;
    const cached = await cache.match(key, { ignoreVary: true });
    if (cached) return cached;
    return fetch(event.request);
  }));
});
`;
await writeFile("dist/sw.js", worker);
await writeFile("dist/build.json", JSON.stringify({ version, commit: process.env.GITHUB_SHA ?? "local" }) + "\n");
await writeFile("dist/.nojekyll", "");
console.log(`PWA ${version}: ${precache.length} local resources precached.`);
