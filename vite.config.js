import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// The sources are in site/; the built site goes to the top of the repository, where Cloudflare Pages
// serves it as it is (the project has no build step of its own).
//
// The first scene of each show is written into the page, so that it is there before any script runs:
// <!--shot:name--> becomes site/public/shots/name.html (made by scripts/capture.mjs), in a scene of its own.
const shots = () => ({
	name: "pine-shots",
	transformIndexHtml(html) {
		return html.replace(/<!--shot:([\w-]+)-->/g, (_, name) => {
			const file = path.join(import.meta.dirname, "site", "public", "shots", `${name}.html`);
			return `<div class="scene on" data-scene="${name}">${fs.readFileSync(file, "utf8").trim()}</div>`;
		});
	},
});

export default defineConfig({
	root: "site",
	build: { outDir: "..", emptyOutDir: false },
	plugins: [shots()],
});
