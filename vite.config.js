import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// The sources are in site/; the built site goes to the top of the repository, where Cloudflare Pages
// serves it as it is (the project has no build step of its own).
//
// The windows of the site are the Pine app's own page, in app/ at the top of the repository: its files
// as pine builds them and the recordings it plays (both made by scripts/capture.mjs), and the player,
// site/public/app/reel.js, which a build copies there. `vite dev` serves that folder too.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const app = () => ({
	name: "pine-app",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			let url = (req.url ?? "").split("?")[0];
			if (!url.startsWith("/app/")) return next();
			if (url === "/app/") url = "/app/index.html";
			const file = path.join(import.meta.dirname, decodeURIComponent(url));
			// (The player is the site's own file: Vite serves it from site/public.)
			if (url === "/app/reel.js" || !file.startsWith(path.join(import.meta.dirname, "app")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
			res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
			fs.createReadStream(file).pipe(res);
		});
	},
});

export default defineConfig({
	root: "site",
	build: { outDir: "..", emptyOutDir: false },
	plugins: [app()],
});
