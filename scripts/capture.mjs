// Takes the pictures of the app that the site shows, as markup and not as images: the real Pine app
// (pine's desktop/), on a pine home of its own with the scripted model server of pine's tests, plays
// a few scenes, and each one is saved as the app's own DOM. The CSS that goes with them is the app's
// own too, cut down to the rules the saved DOM uses and scoped under .pine-shot.
//
//   node scripts/capture.mjs [path to a pine checkout, default ../pine]
//     -> site/public/shots/<scene>.html, site/src/app.css, and a picture of each scene in .capture/
//
// It needs a Mac with a screen, and the pine checkout with desktop/ installed (`npm install` there).
// The home and the folders the app shows lie under /Users/Shared while it runs (.pine, dev, Documents)
// and are removed at the end. Nothing in it is real: the project, the invoice and what the agents say are made up.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const site = path.resolve(import.meta.dirname, "..");
const pine = path.resolve(process.argv[2] ?? path.join(site, "..", "pine"));
const desktop = path.join(pine, "desktop");
const { _electron: electron } = await import(path.join(pine, "node_modules", "playwright-core", "index.mjs"));
const { startMock, textOf } = await import(path.join(pine, "baseline", "tests", "mock.mjs"));

const out = path.join(site, "site", "public", "shots");
const pictures = path.join(site, ".capture");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

// ---- the made-up world ----------------------------------------------------------------------------

// Under /Users/Shared, where the app writes them as ~/dev/shop and ~/Documents/scans. A folder that is there
// already is somebody's, and the script stops rather than touch it.
const BASE = "/Users/Shared";
const made = [".pine", "dev", "Documents"].map((n) => path.join(BASE, n));
for (const p of made) if (fs.existsSync(p)) throw new Error(`${p} exists already. This script makes and removes it; move it away first.`);
process.on("exit", () => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });
const home = path.join(BASE, ".pine");
const shop = path.join(BASE, "dev", "shop");
const scans = path.join(BASE, "Documents", "scans");
fs.mkdirSync(scans, { recursive: true });

write(path.join(shop, "package.json"), '{\n  "name": "shop",\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n');
write(path.join(shop, "README.md"), "# shop\n\nThe little shop: a cart, a checkout, payments.\n");
write(path.join(shop, "src", "cart.ts"), 'export type Item = { sku: string; price: number; qty: number };\n\nexport const cart = {\n  items: [] as Item[],\n  add(item: Item) {\n    this.items.push(item);\n  },\n  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n  },\n};\n');
write(path.join(shop, "src", "pay", "stripe.ts"), 'export const stripe = {\n  async charge(cents: number) {\n    return { ok: cents > 0, id: `ch_${cents}` };\n  },\n};\n');
write(path.join(shop, "src", "routes.ts"), 'export const routes = {\n  "/": "home",\n  "/cart": "cart",\n};\n');
write(path.join(shop, "test", "cart.test.ts"), 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { cart } from "../src/cart.ts";\n\ntest("the cart sums its items", () => {\n  cart.add({ sku: "mug", price: 12, qty: 2 });\n  assert.equal(cart.sum(), 24);\n});\n');
const git = (...args) => execFileSync("git", ["-C", shop, "-c", "user.name=shop", "-c", "user.email=shop@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
git("init", "-q", "-b", "main");
git("add", ".");
git("commit", "-q", "-m", "a cart");

const CHECKOUT = `import { cart } from "./cart.ts";
import { stripe } from "./pay/stripe.ts";

export function Checkout() {
  const total = cart.sum();
  return (
    <Pay total={total}>
      <Card onPay={() => stripe.charge(total * 100)} />
    </Pay>
  );
}
`;
const APPLE = `/** Apple Pay, where the browser has a wallet. */
export const applePay = {
  available() {
    return typeof window !== "undefined" && "ApplePaySession" in window;
  },
  async charge(cents: number) {
    return { ok: cents > 0, id: \`ap_\${cents}\` };
  },
};
`;
const CHECKOUT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Checkout · shop</title><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f4f3ef;color:#191919}
header{display:flex;justify-content:space-between;padding:20px 40px;border-bottom:1px solid #e2e0d9;font-weight:700;letter-spacing:-.01em}
main{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;max-width:980px;margin:40px auto;padding:0 40px}
h1{font-size:32px;letter-spacing:-.03em;margin:0 0 24px}.row{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #e2e0d9}
.total{font-weight:700;font-size:18px;border:0}.pay{background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 2px #0001,0 8px 24px #0000000d}
.apple{display:block;width:100%;height:48px;border:0;border-radius:10px;background:#000;color:#fff;font-size:17px;font-weight:600}
.or{text-align:center;color:#8a877f;margin:16px 0;font-size:13px}label{display:block;font-size:12px;color:#6b6861;margin:12px 0 6px}
.f{height:42px;border:1px solid #d9d6ce;border-radius:8px;background:#fbfaf7}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{margin-top:20px;width:100%;height:48px;border:0;border-radius:10px;background:#1f7a55;color:#fff;font-size:16px;font-weight:600}
</style></head><body><header><span>shop</span><span>Cart (3)</span></header><main><section><h1>Checkout</h1>
<div class="row"><span>Mug, stoneware × 2</span><span>€24.00</span></div><div class="row"><span>Tea, sencha 100 g</span><span>€9.50</span></div>
<div class="row"><span>Shipping</span><span>€4.90</span></div><div class="row total"><span>Total</span><span>€38.40</span></div></section>
<section class="pay"><button class="apple"> Pay</button><div class="or">or pay with a card</div><label>Card number</label><div class="f"></div>
<div class="two"><div><label>Expires</label><div class="f"></div></div><div><label>CVC</label><div class="f"></div></div></div>
<button class="card">Pay €38.40</button></section></main></body></html>`;
const APPLE_TEST = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { applePay } from "../src/pay/apple.ts";\n\ntest("Apple Pay is off without a wallet", () => assert.equal(applePay.available(), false));\ntest("Apple Pay charges", async () => assert.equal((await applePay.charge(2400)).ok, true));\n';

// ---- the model: pine's scripted one, told which script a message means ------------------------------

const mock = await startMock({ strip: /<pine-note>[\s\S]*?<\/pine-note>\s*/g, promptTokens: (body) => 14000 + 900 * (body.messages?.length ?? 0) });
const s = mock.state.scripts;
s.checkout = [
	{ tools: [{ name: "read", args: { path: "src/cart.ts" } }], delayMs: 200 },
	{ tools: [{ name: "write", args: { path: "src/checkout.tsx", content: CHECKOUT } }] },
	{ tools: [{ name: "edit", args: { path: "src/routes.ts", edits: [{ oldText: '  "/cart": "cart",\n', newText: '  "/cart": "cart",\n  "/checkout": "checkout",\n' }] } }] },
	{ tools: [{ name: "bash", args: { command: "npm test" } }] },
	{ text: "The checkout page is in `src/checkout.tsx`, at `/checkout`. It charges the cart's total through Stripe, and the tests pass." },
];
s.applepay = [
	{ tools: [{ name: "write", args: { path: "src/pay/apple.ts", content: APPLE } }] },
	{ tools: [{ name: "edit", args: { path: "src/checkout.tsx", edits: [{ oldText: 'import { stripe } from "./pay/stripe.ts";\n', newText: 'import { stripe } from "./pay/stripe.ts";\nimport { applePay } from "./pay/apple.ts";\n' }, { oldText: "    <Pay total={total}>\n", newText: "    <Pay total={total}>\n      {applePay.available() && <ApplePay onPay={() => applePay.charge(total * 100)} />}\n" }] } }] },
	{ tools: [{ name: "write", args: { path: "test/apple.test.ts", content: APPLE_TEST } }] },
	{ text: "Apple Pay is in, behind a check for the wallet, with two tests of its own. Run them:\n\n```bash\nnpm test\n```" },
];
s.ran = [{ text: "All 3 tests pass. The button only shows where there is a wallet, so try it in Safari. Merge the worktree when you like it." }];
s.coupon = [
	{ tools: [{ name: "read", args: { path: "src/checkout.tsx" } }], delayMs: 200 },
	{ tools: [{ name: "edit", args: { path: "src/cart.ts", edits: [{ oldText: "  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n", newText: "  coupon: 0,\n  sum() {\n    const total = this.items.reduce((s, i) => s + i.price * i.qty, 0);\n    return total * (1 - this.coupon);\n" }] } }] },
	{ tools: [{ name: "bash", args: { command: "sleep 60; npm test" } }] },
	{ text: "done" },
];
s.invoice = [
	{ tools: [{ name: "read", args: { path: path.join(scans, "invoice-0412.txt") } }], delayMs: 200 },
	{ tools: [{ name: "edit", args: { path: "TODO.md", edits: [{ oldText: "# TODO\n\n", newText: "# TODO\n\n- [ ] Hosting, Northwind: €412.30 by 2 Dec · invoice 0412\n" }] } }] },
	{ text: "An **invoice** from Northwind Hosting.\n\n- Amount due: **€412.30** by 2 December\n- Invoice: 0412, for November\n\nAdded to `TODO.md`. That is the third hosting bill this year; together **€1,236.90**." },
];
s.pr = [
	{ tools: [{ name: "read", args: { path: path.join(shop, "src", "cart.ts") } }], delayMs: 200 },
	{ text: "**#42 Add coupon codes** by ana, in example/shop: 3 files, +86 −4.\n\nIt reads well. One thing: the coupon comes off after tax, and `cart.sum()` already holds the tax, so a 10% coupon takes 10% of the tax too. Worth a word before it is merged." },
];
s.price = [{ text: "The **Fridge 3000** is down to **€479.00**, from €549.00 this morning. That is under the €500 you wanted to pay." }];
s.browser = [
	{ tools: [{ name: "mcp__browser__browser_navigate", args: { url: "" } }], delayMs: 200 },
	{ tools: [{ name: "mcp__browser__browser_show", args: {} }] },
	{ text: "The checkout is up: Apple Pay sits above the card form, and the total is right." },
];
/** Which script a request is for, by what its last message says. The message itself stays as it came. */
const MEANS = [[/^build the checkout page/, "checkout"], [/^add Apple Pay/, "applepay"], [/ran a command from your answer/, "ran"], [/^add a coupon field/, "coupon"], [/^open the checkout/, "browser"], [/invoice-0412/, "invoice"], [/Add coupon codes/, "pr"], [/fridge-3000/, "price"]];

// The shop's page, for the browser, and the page of a shop whose price drops, for the http source.
const fridge = { price: "549.00" };
const pages = http.createServer((req, res) => {
	if (req.url?.startsWith("/fridge-3000")) return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>Fridge 3000</title><h1>Fridge 3000</h1><p>Price: ${fridge.price} €</p>`);
	res.writeHead(200, { "content-type": "text/html" }).end(CHECKOUT_PAGE);
});
await new Promise((r) => pages.listen(0, "127.0.0.1", r));
const pagePort = pages.address().port;
s.browser[0].tools[0].args.url = `http://localhost:${pagePort}/checkout`;
/** A free port for pine's control API, so that the webhook can be called. */
const apiPort = await new Promise((r) => { const t = http.createServer().listen(0, "127.0.0.1", () => { const p = t.address().port; t.close(() => r(p)); }); });
const asked = [];
const proxy = http.createServer((req, res) => {
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", () => {
		let body = Buffer.concat(chunks);
		try {
			const json = JSON.parse(body.toString("utf8"));
			const last = [...(json.messages ?? [])].reverse().find((m) => m.role === "user");
			if (last) {
				const said = textOf(last.content).replace(/<pine-note>[\s\S]*?<\/pine-note>\s*/g, "").trim();
				asked.push(said.slice(0, 200));
				const ref = MEANS.find(([re]) => re.test(said))?.[1];
				if (ref) {
					if (typeof last.content === "string") last.content += ` @@REF:${ref}@@`;
					else last.content.push({ type: "text", text: ` @@REF:${ref}@@` });
					body = Buffer.from(JSON.stringify(json));
				}
			}
		} catch {}
		const to = new URL(mock.baseUrl);
		const fwd = http.request({ host: to.hostname, port: to.port, path: req.url, method: req.method, headers: { ...req.headers, host: to.host, "content-length": body.length } }, (back) => {
			res.writeHead(back.statusCode ?? 502, back.headers);
			back.pipe(res);
		});
		fwd.on("error", () => res.destroy());
		fwd.end(body);
	});
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const modelUrl = `http://127.0.0.1:${proxy.address().port}${new URL(mock.baseUrl).pathname}`;

// ---- pine's home -------------------------------------------------------------------------------------

write(path.join(home, "models.json"), JSON.stringify({ providers: { local: { name: "Local", baseUrl: modelUrl, api: "openai-completions", apiKey: "sk-none", models: [{ id: "qwen3-coder", name: "qwen3-coder", contextWindow: 128000, maxTokens: 4096, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
write(path.join(home, "pine.json"), JSON.stringify({ http: { host: "127.0.0.1", port: apiPort }, main: "main", defaults: { model: "local/qwen3-coder", mode: "auto" }, security: { askAccess: false }, mcp: { browser: { pine: "browser" } }, sources: {
	scans: { type: "folder", dir: scans, description: "the scanner's folder" },
	github: { type: "webhook", open: true, description: "pull requests of example/shop" },
	fridge: { type: "http", url: `http://127.0.0.1:${pagePort}/fridge-3000`, match: "Price: ([0-9.,]+)", every: "1s", description: "the price of the Fridge 3000" },
} }, null, 2));
for (const [id, description] of [["main", "Your main agent"], ["mrbanks", "Keeps the bills"], ["reviewer", "Reads pull requests"], ["scout", "Watches prices"], ["watchdog", "Watches the house"]]) {
	write(path.join(home, "agents", id, "agent.json"), JSON.stringify({ description }));
	write(path.join(home, "agents", id, "workspace", "AGENTS.md"), `You are ${id}.\n`);
}
write(path.join(home, "agents", "mrbanks", "workspace", "TODO.md"), "# TODO\n\n- [x] Car insurance, Nordlicht: €312.80, paid 2 Nov\n- [x] Chimney sweep: €68.40, paid 28 Oct\n");
write(path.join(home, "desktop-data", "prefs.json"), JSON.stringify({ theme: "dark", bounds: { width: 1280, height: 800 } }));

// ---- what is saved of a scene ------------------------------------------------------------------------

/** The page's DOM, as it stands, without what only works live; scroll positions as attributes. */
const SNAP = (pictures) => {
	const root = document.getElementById("root");
	root.querySelectorAll("canvas").forEach((c, i) => { if (pictures[i]) c.setAttribute("data-picture", String(i)); });
	for (const el of root.querySelectorAll("*")) if (el.scrollTop > 0 || el.scrollLeft > 0) el.setAttribute("data-scroll", `${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}`);
	const clone = root.cloneNode(true);
	for (const el of root.querySelectorAll("[data-scroll], [data-picture]")) el.removeAttribute("data-scroll"), el.removeAttribute("data-picture");
	clone.querySelectorAll("canvas[data-picture]").forEach((c) => {
		const img = document.createElement("img");
		img.src = pictures[Number(c.getAttribute("data-picture"))];
		img.className = c.className;
		img.setAttribute("style", `${c.getAttribute("style") ?? ""};width:100%;height:100%;object-fit:contain;object-position:top left`);
		c.replaceWith(img);
	});
	// The shell's prompt says who and where the person who took the pictures is: not what the site shows.
	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = n.nodeValue.replace(/[\w.-]+@[\w.-]+(\s)/g, "$1").replace(/^\s(?=\S+ %)/, "");
	clone.querySelectorAll("[data-sonner-toaster], [data-slot=toast], section[aria-label^=Notifications], script, canvas, iframe, link, video, audio, .xterm-helpers, .xterm-accessibility, [data-slot=tooltip-content]").forEach((e) => e.remove());
	// The theme's variables are a style element of the page's (<Mtb>), already in app.css; the terminal's own stay.
	clone.querySelectorAll("style").forEach((e) => { if (!/xterm/.test(e.textContent ?? "")) e.remove(); });
	clone.querySelectorAll("textarea, input").forEach((e) => e.setAttribute("tabindex", "-1"));
	clone.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
	clone.querySelectorAll("img").forEach((e) => { if (!/^data:/.test(e.getAttribute("src") ?? "")) e.remove(); });
	return { html: clone.innerHTML, rootClass: document.documentElement.className, rootStyle: document.documentElement.getAttribute("style") ?? "", rootData: { ...document.documentElement.dataset }, bodyClass: document.body.className };
};

/**
 * Notes which CSS rules match something on the page now (window.__keep), so that after all scenes only
 * those are written. A selector is tried without its states (:hover, ::before ...): a rule for a state of
 * an element that is there is kept. The app's own sheet is handed over as text: a file's rules cannot
 * always be read from the page.
 */
const MARK = (appCss) => {
	const STATE = /::?(before|after|placeholder|selection|marker|backdrop|file-selector-button|first-letter|first-line|-webkit-[\w-]+|-moz-[\w-]+)|:(hover|focus-visible|focus-within|focus|active|visited|target|checked|indeterminate|placeholder-shown|autofill|user-invalid|invalid|popover-open|open|enabled|disabled|read-only|read-write|default|required|optional|empty|playing|paused)(?![\w-])/g;
	const split = (sel) => { const parts = []; let depth = 0, cur = ""; for (const ch of sel) { if (ch === "(" || ch === "[") depth++; if (ch === ")" || ch === "]") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; } parts.push(cur); return parts.map((p) => p.trim()); };
	const used = (sel) => split(sel).some((part) => {
		let q = part.replace(STATE, "").trim();
		if (!q || /[>+~]$/.test(q)) q += "*";
		try { return Boolean(document.querySelector(q)); } catch { return true; }
	});
	window.__keep ??= new Set();
	window.__sheets ??= [...document.styleSheets].map((sh) => { try { return sh.cssRules && sh; } catch { return null; } }).filter((sh) => sh && !sh.href);
	if (!window.__app) { window.__app = new CSSStyleSheet(); window.__app.replaceSync(appCss); }
	const walk = (list, key) => [...list].forEach((r, i) => {
		const k = `${key}/${i}`;
		if (r instanceof CSSStyleRule) { if (used(r.selectorText)) window.__keep.add(k); }
		else if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules, k);
		else window.__keep.add(k);
	});
	[window.__app, ...window.__sheets].forEach((sh, n) => walk(sh.cssRules, String(n)));
	return window.__keep.size;
};

/**
 * The kept rules, scoped under .pine-shot: what was said of the page (:root, html, body) is said of it,
 * and .dark is it in dark. The window is drawn at its own size wherever it is, so: rem is the app's 15px,
 * the screen's height and width are the window's (cq units of .pine-shot, a container), and a media query
 * on the width asks the window's width instead.
 */
const EMIT = () => {
	const ROOT = /^(:root|html|body|:host)+/;
	const split = (sel) => { const parts = []; let depth = 0, cur = ""; for (const ch of sel) { if (ch === "(" || ch === "[") depth++; if (ch === ")" || ch === "]") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; } parts.push(cur); return parts.map((p) => p.trim()); };
	const scope = (sel) => split(sel).map((p) => {
		if (ROOT.test(p)) p = p.replace(ROOT, (m) => ".pine-shot".repeat(Math.max(1, (m.match(/:root|html|body|:host/g) ?? []).length)));
		else if (/^\.dark(?![\w-])/.test(p)) p = `.pine-shot${p}`;
		else p = `.pine-shot ${p}`;
		return p;
	}).join(", ");
	const px = (n, base) => `${+(parseFloat(n) * base).toFixed(3)}px`;
	const emit = (list, key) => {
		let css = "";
		[...list].forEach((r, i) => {
			const k = `${key}/${i}`;
			if (r instanceof CSSStyleRule) {
				if (window.__keep.has(k)) css += scope(r.selectorText) + r.cssText.slice(r.cssText.indexOf("{")) + "\n";
			} else if (r.cssRules && !(r instanceof CSSKeyframesRule)) {
				const inner = emit(r.cssRules, k);
				if (!inner) return;
				let head = r.cssText.slice(0, r.cssText.indexOf("{")).trim();
				if (r instanceof CSSMediaRule && /width/.test(head) && !/hover|prefers|print|pointer/.test(head)) head = head.replace(/^@media/, "@container pine-window").replace(/(-?[\d.]+)rem/g, (_, n) => px(n, 16));
				css += `${head} {\n${inner}}\n`;
			} else if (window.__keep.has(k)) css += r.cssText + "\n";
		});
		return css;
	};
	const css = [window.__app, ...window.__sheets].map((sh, n) => emit(sh.cssRules, String(n))).join("\n");
	return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => px(n, 15)).replace(/(\d*\.?\d+)[dsl]?v(h|w)\b/g, "$1cq$2");
};

/** Leaves out the attributes of a scene that its CSS never reads: they only make the page heavier. */
const PRUNE = ({ html, css }) => {
	const read = new Set([...css.matchAll(/\[([a-zA-Z_:][-\w:.]*)/g)].map((m) => m[1].toLowerCase()));
	for (const a of ["class", "style", "src", "alt", "width", "height", "colspan", "rowspan", "open", "data-scroll", "inert", "dir", "lang"]) read.add(a);
	const t = document.createElement("template");
	t.innerHTML = html;
	for (const el of t.content.querySelectorAll("*")) {
		const svg = el.namespaceURI === "http://www.w3.org/2000/svg";
		for (const { name } of [...el.attributes]) {
			const n = name.toLowerCase();
			if (read.has(n)) continue;
			if (svg && !/^(aria-|data-|id$|role$|tabindex$)/.test(n)) continue;
			el.removeAttribute(name);
		}
	}
	return t.innerHTML;
};

// ---- the app, and the scenes -------------------------------------------------------------------------

fs.rmSync(pictures, { recursive: true, force: true });
fs.mkdirSync(pictures, { recursive: true });
fs.mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [path.join(desktop, "scripts", "build.mjs")], { stdio: "inherit" });
const appCss = fs.readdirSync(path.join(desktop, "dist", "assets")).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(desktop, "dist", "assets", f), "utf8")).join("\n");

const app = await electron.launch({
	executablePath: path.join(desktop, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron"),
	colorScheme: "dark",
	args: [desktop],
	env: { ...process.env, PINE_HOME: home, PINE_DESKTOP_DATA: path.join(home, "desktop-data"), PINE_SKIP_DOWNLOADS: "1", PINE_DESKTOP_DEV_URL: "", PINE_DESKTOP_SHELL: "/bin/zsh" },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
await page.setViewportSize?.({ width: 1280, height: 800 }).catch(() => {});

const sees = (selector, timeout = 30_000) => page.waitForSelector(selector, { timeout });
const menu = (command) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send("pine:menu", c), command);
const api = (method, url, body) => page.evaluate(([m, u, b]) => window.pine.call(m, u, b), [method, url, body]);
const said = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), re.source, { timeout: 60_000 });
const settle = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.mouse.move(2, 790); await sleep(700); };
async function send(text) {
	await page.fill("[data-slot=composer] textarea", text);
	await page.keyboard.press("Enter");
}
const scenes = {};
async function scene(name) {
	await settle();
	await page.screenshot({ path: path.join(pictures, `${name}.png`) });
	await page.evaluate(MARK, appCss);
	const drawn = [];
	for (const c of await page.locator("#root canvas").all()) drawn.push(await c.screenshot({ type: "jpeg", quality: 82 }).then((b) => `data:image/jpeg;base64,${b.toString("base64")}`).catch(() => ""));
	scenes[name] = await page.evaluate(SNAP, drawn);
	console.log(`scene ${name}: ${Math.round(scenes[name].html.length / 1024)} KB`);
}

try {
	await sees("[data-slot=empty] h1");
	const notNow = page.locator("[data-slot=dialog-footer]").getByRole("button", { name: "Not now" });
	if (await notNow.isVisible({ timeout: 3000 }).catch(() => false)) await notNow.click();

	// CODE. A project's folder, opened for a conversation of the main agent; the owner commits what it made.
	await menu(`folder:${shop}`);
	await sees("[data-slot=dialog-title] >> text=Which agent works in");
	await page.keyboard.press("Enter");
	await sees("[data-slot=tab][data-active] [data-slot=tab-name] >> text=shop");
	await send("build the checkout page");
	await said(/charges the cart's total/);
	await menu("code-files");
	await sleep(800);
	await page.locator("[data-slot=code-panel]").getByText("src", { exact: true }).first().click().catch(() => {});
	await sleep(600);
	await scene("code-folder");
	git("add", ".");
	git("commit", "-q", "-m", "checkout");
	const session = (await api("GET", "/agents/main/folders")).data.find((u) => u.folder === shop).session;

	// A worktree of its own for the conversation, and Apple Pay in it.
	const tree = await api("POST", "/agents/main/worktree", { session, name: "apple-pay" });
	if (tree.status && tree.status >= 400) throw new Error(`worktree: ${JSON.stringify(tree)}`);
	await sleep(1200);
	await send("add Apple Pay");
	await said(/Run them/);
	await menu("code-changes");
	await sleep(1200);
	await scene("code-worktree");
	await page.locator("[data-slot=code-panel]").getByText("checkout.tsx").first().click().catch(() => {});
	await sleep(1000);
	await scene("code-diff");

	// The tests, in the terminal beside the conversation.
	await page.locator("[data-slot=markdown]", { hasText: "Run them" }).last().locator("[data-run]").first().waitFor({ timeout: 30_000 });
	await menu("code-terminal");
	await sees("[data-slot=code-panel] [data-slot=terminal]");
	await sleep(1500);
	await page.click("[data-slot=terminal]");
	await page.keyboard.type("npm test");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => /pass 3/.test(document.querySelector("[data-slot=terminal] .xterm-rows")?.textContent ?? ""), undefined, { timeout: 30_000 });
	await scene("code-run");

	// The page itself, in the conversation's browser beside it: the agent opens it, the owner allows the local address.
	try {
		await send("open the checkout and show it to me");
		const allow = page.locator("[data-slot=dialog-content][data-tone=warn]").getByRole("button", { name: /^Allow/ });
		await allow.waitFor({ timeout: 30_000 });
		await allow.click();
		await said(/Apple Pay sits above/);
		await page.waitForSelector("[data-slot=browser] canvas[data-drawn]", { timeout: 30_000 });
		await page.waitForFunction(() => !/⠋|Working/.test(document.querySelector("[data-slot=message-scroller-content]")?.innerHTML ?? "") && !document.querySelector("[data-slot=message-scroller-content] [aria-label=Working]"), undefined, { timeout: 15_000 }).catch(() => {});
		await sleep(3000);
		await scene("code-browser");
		await menu("browser");
	} catch (e) {
		console.log("no browser scene:", String(e.message ?? e).split("\n")[0]);
		await page.screenshot({ path: path.join(pictures, "browser-failed.png") });
		await page.keyboard.press("Escape").catch(() => {});
	}

	// HERO. The same conversation goes on while a command runs, with what changed beside it.
	await send("add a coupon field");
	await page.waitForFunction(() => /sleep 60/.test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), undefined, { timeout: 30_000 });
	await menu("code-changes");
	await sleep(1200);
	await page.locator("[data-slot=code-panel]").getByText("cart.ts").first().click().catch(() => {});
	await sleep(1000);
	await scene("hero");

	// EVENTS. Each agent listens to something, in its main conversation.
	const conversation = (agent) => page.locator(`[aria-label="Conversations with ${agent}"]`).getByText("main conversation").first().click();
	await api("POST", "/agents/mrbanks/subscribe", { source: "scans", throttle: "1s" });
	await api("POST", "/agents/reviewer/subscribe", { source: "github", throttle: "1s" });
	await api("POST", "/agents/scout/subscribe", { source: "fridge", throttle: "1s" });

	// A letter arrives in the folder the scanner writes to.
	await conversation("mrbanks");
	await sleep(800);
	write(path.join(scans, "invoice-0412.txt"), "Northwind Hosting\nInvoice 0412 · November\nAmount due: EUR 412.30 by 2 December\n");
	await said(/third hosting bill/);
	await menu("code-files");
	await sleep(800);
	await page.locator("[data-slot=code-panel]").getByText("TODO.md").first().click().catch(() => {});
	await sleep(1000);
	await scene("events-scan");

	// A pull request, from GitHub's webhook.
	await conversation("reviewer");
	await sleep(800);
	await fetch(`http://127.0.0.1:${apiPort}/hook/github`, { method: "POST", headers: { "content-type": "application/json", "x-github-event": "pull_request", "user-agent": "GitHub-Hookshot/7f3a2c1" }, body: JSON.stringify({ action: "opened", number: 42, pull_request: { title: "Add coupon codes", user: { login: "ana" }, additions: 86, deletions: 4, changed_files: 3, base: { ref: "main" }, head: { ref: "coupons" } }, repository: { full_name: "example/shop" } }) }).then((r) => { if (!r.ok) throw new Error(`webhook: ${r.status}`); });
	await said(/Worth a word/);
	await sleep(800);
	await scene("events-github");

	// A price that drops, on a page that is looked at again and again.
	await conversation("scout");
	await sleep(2500);
	fridge.price = "479.00";
	await said(/under the €500/);
	await sleep(800);
	await scene("events-price");

	// The event log.
	await menu("events");
	await sleep(1500);
	await scene("events-log");

	const css = await page.evaluate(EMIT);
	write(path.join(site, "site", "src", "app.css"), `/* The Pine app's own CSS, cut down to what the shots use and scoped under .pine-shot (scripts/capture.mjs). */\n${css}`);
	for (const sc of Object.values(scenes)) sc.html = await page.evaluate(PRUNE, { html: sc.html, css });
	for (const [name, sc] of Object.entries(scenes)) write(path.join(out, `${name}.html`), `<div class="pine-shot ${sc.rootClass}" style="${sc.rootStyle.replace(/"/g, "&quot;")}" ${Object.entries(sc.rootData).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`).join(" ")} inert aria-hidden="true"><div class="pine-body ${sc.bodyClass}">${sc.html}</div></div>\n`);
	console.log(`app.css: ${Math.round(css.length / 1024)} KB, ${Object.keys(scenes).length} scenes, pictures in ${pictures}`);
	if (errors.length) console.log("errors in the page:", errors);
} catch (e) {
	await page.screenshot({ path: path.join(pictures, "failed.png") }).catch(() => {});
	console.error(e);
	console.error("the model was asked:", asked.slice(-6));
	process.exitCode = 1;
} finally {
	await app.close().catch(() => {});
	await mock.close?.().catch(() => {});
	proxy.close();
	pages.close();
}
