// Takes the pictures of the app that the site shows, as markup and not as images: the real Pine app
// (pine's desktop/), on a pine home of its own with the scripted model server of pine's tests, plays
// the scenes, and each one is saved as the app's own DOM. The CSS that goes with them is the app's own
// too, cut down to the rules the saved DOM uses and scoped under .pine-shot.
//
//   node scripts/capture.mjs [path to a pine checkout, default ../pine]
//     -> site/public/shots/<scene>.html, site/src/app.css, and a picture of each scene in .capture/
//
// It needs a Mac with a screen, poppler's pdftoppm, and the pine checkout with desktop/ installed (`npm
// install` there). The home and the folders the app shows lie under /Users/Shared while it runs (.pine,
// dev, Documents, Downloads) and are removed at the end. Nothing in it is real: the project, the letters,
// the people and what the agents say are made up. Where the owner clicked to get to a scene is kept with
// it (data-cursor), for the pointer the site draws.
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

// Under /Users/Shared, which the pictures show as ~. A folder that is there already is somebody's, and the
// script stops rather than touch it.
const BASE = "/Users/Shared";
const made = [".pine", "dev", "Documents", "Downloads"].map((n) => path.join(BASE, n));
for (const p of made) if (fs.existsSync(p)) throw new Error(`${p} exists already. This script makes and removes it; move it away first.`);
process.on("exit", () => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });
const home = path.join(BASE, ".pine");
const shop = path.join(BASE, "dev", "shop");
const scans = path.join(BASE, "Documents", "scans");
const downloads = path.join(BASE, "Downloads");
fs.mkdirSync(scans, { recursive: true });
fs.mkdirSync(downloads, { recursive: true });

write(path.join(shop, "package.json"), '{\n  "name": "shop",\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n');
write(path.join(shop, "README.md"), "# shop\n\nThe little shop: a cart, a checkout, payments.\n");
write(path.join(shop, "src", "cart.ts"), 'export type Item = { sku: string; price: number; qty: number };\n\nexport const cart = {\n  items: [] as Item[],\n  add(item: Item) {\n    this.items.push(item);\n  },\n  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n  },\n};\n');
write(path.join(shop, "src", "pay", "stripe.ts"), 'export const stripe = {\n  async charge(cents: number) {\n    return { ok: cents > 0, id: `ch_${cents}` };\n  },\n};\n');
write(path.join(shop, "src", "routes.ts"), 'export const routes = {\n  "/": "home",\n  "/cart": "cart",\n};\n');
write(path.join(shop, "test", "cart.test.ts"), 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { cart } from "../src/cart.ts";\n\ntest("the cart sums its items", () => {\n  cart.add({ sku: "mug", price: 12, qty: 2 });\n  assert.equal(cart.sum(), 24);\n});\n');
const gitIn = (dir, ...args) => execFileSync("git", ["-C", dir, "-c", "user.name=pine", "-c", "user.email=pine@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
const git = (...args) => gitIn(shop, ...args);
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
const COUPON_TEST = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { cart } from "../src/cart.ts";\n\ntest("a coupon takes its share off", () => {\n  cart.add({ sku: "mug", price: 12, qty: 2 });\n  cart.coupon = 0.1;\n  assert.equal(cart.sum(), 21.6);\n});\n';
/** The heat pump's manual, as small as a PDF can be and still be one. */
const PROTOCOL_PDF = (() => {
	const text = "BT 72 720 Td /F1 18 Tf (Heat pump WP 9 - Modbus TCP register map) Tj ET";
	const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
	let pdf = "%PDF-1.4\n";
	const at = objs.map((o, i) => { const here = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return here; });
	const xref = pdf.length;
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return pdf;
})();
const LEASE = "Hausverwaltung Nord\nLease renewal, Lindenstraße 12, 3rd floor left\n\nFrom 1 January 2027 the rent is EUR 1,060.90 a month (now EUR 1,030.00, +3%).\nNotice period: three months, as before.\nPlease sign and return by 15 December 2026.\n";
write(path.join(BASE, "Documents", "protocol.pdf"), PROTOCOL_PDF);

// ---- the events the sources report ---------------------------------------------------------------
// Three come from sources that really run (a folder, a webhook, a web page); the others are what each
// type reports, in its own words (its topic and its fields, as src/sources/<type>.ts emits them),
// handed to the bus as that source would. Each wakes one agent in a conversation named after the source.

const EVENTS = [
	{ key: "mail", type: "mail", about: "your mail", agent: "postie", event: "mail", payload: { from: "lena.brandt@hv-nord.example", fromName: "Lena Brandt", to: ["you@example.com"], subject: "Heating service on Thursday", date: "2026-11-19T08:12:00Z", text: "Hello,\n\nthe heating in your flat is serviced on Thursday, 27 November, between 9 and 11. Please make sure somebody is at home.\n\nKind regards\nLena Brandt, Hausverwaltung Nord" },
		said: [{ text: "**Lena Brandt** of the property management: the heating is serviced on **Thursday 27 Nov, 9–11**, and somebody has to be at home.\n\nNothing else is in your calendar then. Shall I put it in?" }] },
	{ key: "slack", type: "slack", about: "#deploys", agent: "ops", event: "message", payload: { text: "checkout throws 500s since the last deploy?? <@ops>", user: "U04A1MAYA", userName: "maya", channel: "C01DEPLOY", channelName: "deploys", kind: "channel", ts: "1763542921.000200", why: "mention", mention: "me" },
		said: [{ tools: [{ name: "bash", args: { command: `git -C ${shop} log --oneline -3` } }], delayMs: 200 }, { text: "maya asks in **#deploys** about 500s on the checkout. The last deploy is the commit **checkout**, the first with that page: it charges through Stripe, and the server has no Stripe key yet.\n\nRoll back, or set `STRIPE_KEY` there." }] },
	{ key: "telegram", type: "telegram", about: "your phone", agent: "main", event: "message", talks: true, payload: { text: "what did the fridge end up costing?", name: "Robin", username: "robin", chatId: 4242, messageId: 118 },
		said: [{ text: "**€479.** scout saw the price drop on Tuesday morning, and you bought it the same day." }] },
	{ key: "discord", type: "discord", about: "the shop's server", agent: "reviewer", event: "message", payload: { text: "the checkout button does nothing in Firefox since 2.3 😕", user: "381920114", userName: "kiki", channel: "99210", channelName: "bugs", guild: "shop community" },
		said: [{ tools: [{ name: "read", args: { path: path.join(shop, "src", "checkout.tsx") } }], delayMs: 200 }, { text: "kiki reports in **#bugs**: the checkout button does nothing in Firefox since 2.3. The button only calls `stripe.charge`; the browser's console will say more. I wrote it up as an issue for you to look at." }] },
	{ key: "matrix", type: "matrix", about: "the family's rooms", agent: "postie", event: "message", payload: { text: "Who brings the cake on Sunday? 🎂", user: "@mum:matrix.example", room: "!fam:matrix.example", roomName: "Family", kind: "room", id: "$9f2b" },
		said: [{ text: "Mum asks in **Family** who brings the cake on Sunday. Nobody has answered yet." }] },
	{ key: "github", real: "webhook", agent: "reviewer" },
	{ key: "downloads", real: "folder", agent: "postie" },
	{ key: "feed", type: "feed", about: "releases of vite", agent: "scout", event: "entry", payload: { feed: "vite releases", title: "vite@8.4.0", link: "https://github.com/vitejs/vite/releases/tag/v8.4.0", id: "tag:github.com,2008:Repository/v8.4.0", published: "2026-11-19T07:40:00Z", author: "vitebot" },
		said: [{ text: "**Vite 8.4.0** is out. Nothing in its notes touches what the shop uses, and it fixes the CSS order bug from October. Safe to update." }] },
	{ key: "calendar", type: "calendar", about: "your calendar", agent: "main", event: "changed", payload: { calendar: "Personal", uid: "a91f-dentist", summary: "Dentist, Dr. Weiss", start: "2026-11-27T09:30:00+01:00", end: "2026-11-27T10:15:00+01:00", location: "Lindenstraße 40", was: { summary: "Dentist, Dr. Weiss", start: "2026-11-25T10:00:00+01:00" } },
		said: [{ text: "The dentist moved to **Thursday 27 Nov, 9:30**. That morning the heating is serviced at home, 9–11. One of them has to move." }] },
	{ key: "fridge", real: "http", agent: "scout" },
	{ key: "mqtt", type: "mqtt", about: "the house's sensors", agent: "watchdog", event: "message", payload: { topic: "home/washer/power", value: "0.4" },
		said: [{ text: "The washing machine is done: it draws **0.4 W**, down from 2 kW an hour ago. Hang it up." }] },
	{ key: "modbus", type: "modbus", about: "the solar inverter", agent: "watchdog", event: "changed", payload: { name: "battery_soc", value: 96, previous: 88 },
		said: [{ text: "The house battery is at **96 %**, and the sun is still up. A good hour for the dishwasher and the car." }] },
	{ key: "serial", type: "serial", about: "the soil sensor", agent: "watchdog", event: "line", payload: { port: "/dev/tty.usbmodem1101", line: "soil 212", value: "212", previous: "388" },
		said: [{ text: "The basil's soil fell from 388 to **212**. Water it today." }] },
	{ key: "syslog", type: "syslog", about: "the router's log", agent: "ops", event: "line", payload: { host: "router", app: "sshd", severity: "warning", facility: "auth", message: "Failed password for root from 203.0.113.7 port 52211 ssh2", from: "192.168.1.1" },
		said: [{ text: "Somebody is trying **root passwords** on the router, from 203.0.113.7. The router still takes passwords; turn that off:\n\n```bash\nssh admin@192.168.1.1 'uci set dropbear.@dropbear[0].PasswordAuth=off; uci commit'\n```" }] },
	{ key: "onvif", type: "onvif", about: "the door camera", agent: "watchdog", event: "event", payload: { topic: "tns1:RuleEngine/CellMotionDetector/Motion", source: { VideoSourceConfigurationToken: "front-door" }, data: { IsMotion: "true" }, time: "2026-11-19T13:02:11Z", active: true },
		said: [{ text: "Motion at the **front door**, 14:02, and nobody is at home: both phones are away. I keep watching it." }] },
	{ key: "smtp", type: "smtp", about: "mail from the devices", agent: "ops", event: "mail", payload: { from: "nas@home.lan", to: ["pine@home.lan"], subject: "[nas] SMART warning: disk 2", text: "Disk 2 (WD Red 4 TB): 24 reallocated sectors (was 0)." },
		said: [{ text: "Disk 2 of the NAS is starting to fail: **24 reallocated sectors**, none yesterday. The pool survives one disk. Order a new one this week." }] },
	{ key: "ftp", type: "ftp", about: "the office scanner", agent: "postie", event: "upload", payload: { file: "tax-office-2026-11-19.pdf", path: path.join(home, "data", "sources", "ftp", "tax-office-2026-11-19.pdf"), size: 182344, from: "192.168.1.23" },
		said: [{ text: "The tax office confirms your return for 2025: **€1,184.20** come back, paid by early December. Nothing to do." }] },
	{ key: "stream", type: "stream", about: "the CI's builds", agent: "ops", event: "message", payload: { value: '{"build":812,"branch":"main","status":"failed","step":"test"}', event: "build", id: "812" },
		said: [{ text: "Build **812** on main failed in the tests: `cart.test.ts` expects 24, and with the coupon it is 21.60. The test needs the coupon reset." }] },
	{ key: "command", type: "command", about: "df -h /", agent: "ops", event: "changed", payload: { command: "df -h /", code: 0, added: ["/dev/disk3s1  460Gi  419Gi   41Gi  91%  /"], removed: ["/dev/disk3s1  460Gi  401Gi   59Gi  88%  /"] },
		said: [{ text: "The disk is **91 %** full, 18 GB more than yesterday. Most of it is new simulator runtimes in ~/Library/Developer." }] },
	{ key: "presence", type: "presence", about: "phones on the network", agent: "watchdog", event: "arrived", payload: { name: "Robin's iPhone", address: "192.168.1.31", service: "_apple-mobdev2._tcp", awayFor: 32400 },
		said: [{ text: "**Robin is home**, after 9 hours. The heating has been on since 17:30." }] },
	{ key: "system", type: "system", about: "this Mac", agent: "main", event: "woke", payload: null,
		said: [{ text: "Welcome back. While the Mac slept: the washing finished, **#42** waits for your review, and the Fridge 3000 is down to €479." }] },
	{ key: "yours", agent: "main", yours: true },
];

// ---- the model: pine's scripted one, told which script a message means ------------------------------

const JUDGE = /You check whether an AI agent has finished/;
let judged = 0;
const mock = await startMock({
	strip: /<pine-note>[\s\S]*?<\/pine-note>\s*/g,
	promptTokens: (body) => 14000 + 900 * (body.messages?.length ?? 0),
	withoutTools: ({ system, user }) => (JUDGE.test(system) ? (++judged === 1 ? "CONTINUE: the coupon test fails, the coupon is not in yet" : "MET: all 4 tests pass, the coupon one too") : `SUMMARY-OK chars=${user.length}`),
});
const s = mock.state.scripts;
s.make = [
	{ tools: [{ name: "create_agent", args: { id: "mrbanks", description: "Keeps the bills", instructions: "You are mrbanks. You keep your owner's bills: what is to be paid, to whom and by when.\nKeep the open ones in TODO.md, one line each.\n" } }], delayMs: 200 },
	{ text: "**mrbanks** is there. It is in the sidebar; tell it what to watch." },
];
s.teach = [
	{ tools: [{ name: "add_source", args: { name: "scans", type: "folder", description: "the scanner's folder", options: { dir: scans }, note: "A letter was scanned: say what it is, the payment details, and add it to TODO.md." } }], delayMs: 200 },
	{ tools: [{ name: "edit", args: { path: "AGENTS.md", edits: [] } }] },
	{ text: "Watching `~/Documents/scans`. The job is in my `AGENTS.md`, so I keep it in every conversation." },
];
s.bill = [
	{ tools: [{ name: "bash", args: { command: `mkdir -p pages && pdftoppm -r 40 -png ${scans}/water-bill.pdf pages/water-bill` } }], delayMs: 300 },
	{ tools: [{ name: "read", args: { path: "pages/water-bill-1.png" } }, { name: "read", args: { path: "pages/water-bill-2.png" } }] },
	{ tools: [{ name: "edit", args: { path: "TODO.md", edits: [{ oldText: "- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n", newText: "- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n- [ ] Water, Stadtwerke Musterstadt: €219.41 by 26 Nov · ref WA-2026-104233\n      IBAN DE89 3704 0044 0532 0130 00\n" }] } }], delayMs: 6000 },
	{ text: "A **water bill**, 2 pages.\n\n| To pay | |\n|---|---|\n| Payee | Stadtwerke Musterstadt GmbH |\n| IBAN | DE89 3704 0044 0532 0130 00 |\n| BIC | COBADEFFXXX |\n| Amount | **€219.41** |\n| Due | 26 Nov 2026 |\n| Reference | WA-2026-104233 |\n\nThe prepayment goes up to **€49.00** a month from 15 Dec. Added to `TODO.md`." },
];
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
	{ tools: [{ name: "bash", args: { command: "git add -A && git commit -qm 'Apple Pay' && git log --oneline -2" } }] },
	{ text: "Apple Pay is in, behind a check for the wallet, with two tests of its own, and committed on `pine/apple-pay`. Run them:\n\n```bash\nnpm test\n```" },
];
s.ran = [{ text: "All 3 tests pass. The button only shows where there is a wallet, so try it in Safari." }];
const steps = (...st) => ({ tools: [{ name: "todo", args: { items: [["Write a test for the coupon", st[0]], ["Take the coupon off the total", st[1]], ["Run every test", st[2]]].map(([text, status]) => ({ text, status })) } }] });
s.goal1 = [
	steps("in_progress", "pending", "pending"),
	{ tools: [{ name: "write", args: { path: "test/coupon.test.ts", content: COUPON_TEST } }] },
	steps("done", "pending", "pending"),
	{ tools: [{ name: "bash", args: { command: "npm test 2>&1 | tail -4" } }] },
	{ text: "The coupon's test is there, and fails as it should: the cart has no coupon yet. That comes next." },
];
s.goal2 = [
	steps("done", "in_progress", "pending"),
	{ tools: [{ name: "edit", args: { path: "src/cart.ts", edits: [{ oldText: "  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n", newText: "  coupon: 0,\n  sum() {\n    const total = this.items.reduce((s, i) => s + i.price * i.qty, 0);\n    return total * (1 - this.coupon);\n" }] } }] },
	{ ...steps("done", "done", "in_progress"), delayMs: 200 },
	{ tools: [{ name: "bash", args: { command: "npm test 2>&1 | tail -4" } }], delayMs: 6000 },
	steps("done", "done", "done"),
	{ text: "All 4 tests pass, the coupon's too: 10% off €24.00 is €21.60." },
];
s.browser = [
	{ tools: [{ name: "mcp__browser__browser_navigate", args: { url: "" } }], delayMs: 200 },
	{ tools: [{ name: "mcp__browser__browser_show", args: {} }] },
	{ text: "The checkout is up: Apple Pay sits above the card form, and the total is right." },
];
s.pr = [
	{ tools: [{ name: "read", args: { path: path.join(shop, "src", "cart.ts") } }], delayMs: 200 },
	{ text: "**#42 Add coupon codes** by ana, in example/shop: 3 files, +86 −4.\n\nIt reads well. One thing: the coupon comes off after tax, so a 10% coupon takes 10% of the tax too. Worth a word before it is merged." },
];
s.price = [{ text: "The **Fridge 3000** is down to **€479.00**, from €549.00 this morning. That is under the €500 you wanted to pay." }];
s.lease = [
	{ tools: [{ name: "read", args: { path: path.join(downloads, "lease-renewal.txt") } }], delayMs: 200 },
	{ text: "The **lease renewal**: from January the rent is **€1,060.90**, 3% more. The notice period stays three months. Sign and return it by **15 December**." },
];
s.yours = [{ text: "No problem. I'll study `protocol.pdf` and add a source for it, unless one of the types we have covers it already: a heat pump often speaks Modbus, and that one is there." }];
for (const e of EVENTS) if (e.said) s[`ev_${e.key}`] = e.said;

/** Which script a request is for, by what its last message says. The message itself stays as it came. */
const MEANS = [
	[/^new agent: mrbanks/, "make"], [/^watch ~\/Documents\/scans/, "teach"], [/water-bill\.pdf/, "bill"],
	[/^build the checkout page/, "checkout"], [/^add Apple Pay/, "applepay"], [/ran a command from your answer/, "ran"], [/^open the checkout/, "browser"],
	// The goal's first round is asked in other words than the rounds after it.
	[/set this as the goal of this conversation/, "goal1"], [/set a goal for this conversation/, "goal2"],
	[/Add coupon codes/, "pr"], [/fridge-3000/, "price"], [/lease-renewal/, "lease"], [/this is the protocol of our heat pump/, "yours"],
	...EVENTS.filter((e) => e.said).map((e) => [new RegExp(`"${e.key}" \\(|^${e.payload?.text?.slice(0, 20).replace(/[?.*+()[\]]/g, "\\$&")}`), `ev_${e.key}`]),
];

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
			// pi hands pictures a tool read back as a message of their own; the scripted model would take it for the owner's next.
			const pictures = (json.messages ?? []).filter((m) => m.role === "user" && /^Attached image\(s\) from tool result/.test(textOf(m.content)));
			if (pictures.length) { json.messages = json.messages.filter((m) => !pictures.includes(m)); body = Buffer.from(JSON.stringify(json)); }
			const last = [...(json.messages ?? [])].reverse().find((m) => m.role === "user");
			// Only a request that offers tools is a turn of an agent's: the others are pine's own (the judge).
			if (last && json.tools?.length) {
				const said = textOf(last.content).replace(/<pine-note>[\s\S]*?<\/pine-note>\s*/g, "").trim();
				asked.push(said.slice(0, 200));
				const found = MEANS.find(([re]) => re.test(said))?.[1];
				const ref = found;
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

/** What a subscription of `agent` to source `key` amounts to (SourceHost.route in pine's src/sources.ts), for a source the script reports for. */
const routeOf = (e) => {
	const what = `${e.type}: ${e.about}`;
	const base = { name: `sub:${e.agent}:${e.key}:${e.key}`, on: [`source/${e.key}/#`], key: "subscription", agent: e.agent, session: e.key, label: `${e.key}: {{topic}}`, trust: "owner" };
	if (e.talks) return { ...base, prompt: "{{payload.text}}", label: `${e.key}: {{payload.name}}`, preface: `[Your owner wrote this to you through "${e.key}" (${what}). Your answer is sent back there, so write it for that reader.]` };
	return { ...base, whole: true, preface: `[You are subscribed to the event source "${e.key}" (${what}), and it has just reported the event below. Act on it as your instructions say. If nothing needs doing, say so in one line.]`, taint: `an event from the source "${e.key}"` };
};
write(path.join(home, "models.json"), JSON.stringify({ providers: { local: { name: "Local", baseUrl: modelUrl, api: "openai-completions", apiKey: "sk-none", models: [{ id: "qwen3-coder", name: "qwen3-coder", contextWindow: 128000, maxTokens: 4096, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
write(path.join(home, "pine.json"), JSON.stringify({
	http: { host: "127.0.0.1", port: apiPort }, main: "main", defaults: { model: "local/qwen3-coder", mode: "auto" }, security: { askAccess: false }, mcp: { browser: { pine: "browser" } },
	sources: {
		github: { type: "webhook", open: true, description: "pull requests of example/shop" },
		fridge: { type: "http", url: `http://127.0.0.1:${pagePort}/fridge-3000`, match: "Price: ([0-9.,]+)", every: "1s", description: "the price of the Fridge 3000" },
		downloads: { type: "folder", dir: downloads, description: "your Downloads" },
	},
	routes: EVENTS.filter((e) => e.payload !== undefined).map(routeOf),
}, null, 2));
for (const [id, description] of [["main", "Your main agent"], ["postie", "Reads the mail and the chats"], ["ops", "Keeps the servers"], ["reviewer", "Reads pull requests"], ["scout", "Watches prices and releases"], ["watchdog", "Watches the house"]]) {
	write(path.join(home, "agents", id, "agent.json"), JSON.stringify({ description }));
	write(path.join(home, "agents", id, "workspace", "AGENTS.md"), `You are ${id}.\n`);
}
write(path.join(home, "desktop-data", "prefs.json"), JSON.stringify({ theme: "dark", bounds: { width: 1280, height: 800 } }));

// ---- what is saved of a scene ------------------------------------------------------------------------

/** Pictures that the page shows from the daemon become data: what is saved does not reach the daemon. The main process fetches them (the page cannot). */
async function inline() {
	const srcs = await page.evaluate(() => [...new Set([...document.querySelectorAll("body img")].map((i) => i.getAttribute("src") ?? "").filter((s) => s && !s.startsWith("data:")))]);
	const failed = [];
	for (const src of srcs) {
		const data = await app.evaluate(async ({ net }, url) => {
			const r = await net.fetch(url);
			return { type: r.headers.get("content-type") ?? "image/png", b64: Buffer.from(await r.arrayBuffer()).toString("base64") };
		}, src).catch((e) => (failed.push(`${src}: ${e.message}`), undefined));
		if (data) await page.evaluate(([s, u]) => document.querySelectorAll("body img").forEach((i) => { if (i.getAttribute("src") === s) i.dataset.inline = u; }), [src, `data:${data.type};base64,${data.b64}`]);
	}
	return failed;
}

/** The page's DOM, as it stands, without what only works live; scroll positions as attributes. */
const SNAP = (pictures) => {
	// The whole body: dialogs and menus lie beside #root, in portals of their own.
	const root = document.body;
	root.querySelectorAll("canvas").forEach((c, i) => { if (pictures[i]) c.setAttribute("data-picture", String(i)); });
	for (const el of root.querySelectorAll("*")) if (el.scrollTop > 0 || el.scrollLeft > 0) el.setAttribute("data-scroll", `${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}`);
	const clone = root.cloneNode(true);
	for (const el of root.querySelectorAll("[data-scroll], [data-picture], [data-inline]")) el.removeAttribute("data-scroll"), el.removeAttribute("data-picture"), el.removeAttribute("data-inline");
	clone.querySelectorAll("canvas[data-picture]").forEach((c) => {
		const img = document.createElement("img");
		img.src = pictures[Number(c.getAttribute("data-picture"))];
		img.className = c.className;
		img.setAttribute("style", `${c.getAttribute("style") ?? ""};width:100%;height:100%;object-fit:contain;object-position:top left`);
		c.replaceWith(img);
	});
	clone.querySelectorAll("img[data-inline]").forEach((img) => { img.setAttribute("src", img.dataset.inline); img.removeAttribute("data-inline"); });
	// The shell's prompt says who and where the person who took the pictures is: not what the site shows.
	// The made-up folders lie under /Users/Shared, and are shown where they would be: in the home folder.
	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = n.nodeValue.replace(/[\w.-]+@[\w.-]+(\s)/g, "$1").replace(/^\s(?=\S+ %)/, "").replaceAll("/Users/Shared/", "~/").replaceAll("/Users/Shared", "~");
	for (const el of clone.querySelectorAll("[title]")) el.setAttribute("title", el.getAttribute("title").replaceAll("/Users/Shared/", "~/"));
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
		else if (/^\.dark(?![\w\\-])/.test(p)) p = `.pine-shot${p}`; // .dark itself, not a dark: utility (.dark\:...)
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
	// (not in a class name: an escaped "\.75rem" there is part of the name)
	return css.replace(/(?<![\\\d.])(-?\d*\.?\d+)rem\b/g, (_, n) => px(n, 15)).replace(/(\d*\.?\d+)[dsl]?v(h|w)\b/g, "$1cq$2");
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
fs.rmSync(out, { recursive: true, force: true });
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
const conv = "[data-slot=message-scroller-content]";
const said = (re, timeout = 60_000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), re.source, { timeout });
const settle = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.mouse.move(2, 790); await sleep(700); };
async function send(text) {
	await page.fill("[data-slot=composer] textarea", text);
	await page.keyboard.press("Enter");
}
const panel = () => page.locator("[data-slot=code-panel]");
/** A file in the pane's list: back to the list first, if a file is open (its text may name the file too). */
async function file(name, label) {
	const back = panel().getByRole("button", { name: /^Back to the (list|files)$/ }).first();
	if (await back.isVisible().catch(() => false)) { await back.click(); await sleep(600); }
	await click(name, panel().getByText(label, { exact: label === "src" }).first());
}
/** Where the owner's hand was for a scene: the middle of what was clicked, in the window's pixels. */
const cursor = {};
async function point(name, locator) {
	const b = await locator.boundingBox().catch(() => null);
	if (b) cursor[name] = [Math.round(b.x + Math.min(b.width / 2, 24)), Math.round(b.y + b.height / 2)];
}
async function click(name, locator) {
	await locator.waitFor({ timeout: 30_000 });
	await point(name, locator);
	await locator.click();
}
/** Opens a conversation by the sidebar, as the owner would. */
async function open(agent, session, name) {
	const row = page.locator(`[aria-label="Conversations with ${agent}"] [title^="${agent} · ${session} "]`).first();
	await row.waitFor({ timeout: 30_000 });
	if (name) await point(name, row);
	await row.click();
	await sleep(700);
}
const scenes = {};
async function scene(name) {
	await settle();
	await page.screenshot({ path: path.join(pictures, `${name}.png`), timeout: 10_000 }).catch(() => console.log(`no picture of ${name}`));
	await page.evaluate(MARK, appCss);
	const failed = await inline();
	if (failed.length) console.log(name, "pictures not kept:", failed);
	const drawn = [];
	for (const c of await page.locator("body canvas").all()) drawn.push(await c.screenshot({ type: "jpeg", quality: 82 }).then((b) => `data:image/jpeg;base64,${b.toString("base64")}`).catch(() => ""));
	scenes[name] = await page.evaluate(SNAP, drawn);
	console.log(`scene ${name}: ${Math.round(scenes[name].html.length / 1024)} KB${cursor[name] ? ` · pointer at ${cursor[name]}` : ""}`);
}
/** The owner's yes in pine's question, wherever it is asked. */
async function allow(name) {
	const yes = page.locator("[data-slot=dialog-content], [data-slot=alert-dialog-content]").getByRole("button", { name: /^Allow|^Create|^Yes|^Add/ }).first();
	await yes.waitFor({ timeout: 30_000 });
	if (name) await point(name, yes);
	// The dialog's own key for it, where a click does not land while it settles.
	return { click: () => yes.click({ timeout: 5000 }).catch(() => page.keyboard.press("a")) };
}

try {
	await sees("[data-slot=empty] h1", 90_000);
	const notNow = page.locator("[data-slot=dialog-footer]").getByRole("button", { name: "Not now" });
	if (await notNow.isVisible({ timeout: 3000 }).catch(() => false)) await notNow.click();

	// HERO. The main agent makes an agent for the bills; the owner tells it what to watch, and a letter comes.
	await open("main", "main");
	await send("new agent: mrbanks, for my bills. same model");
	// The owner's yes is not in the picture: the scene is the agent that came of it, in the sidebar.
	await (await allow()).click();
	await said(/tell it what to watch/);
	await sleep(600);
	await point("hero-make", page.locator('[aria-label="Conversations with mrbanks"]').first());
	await scene("hero-make");
	const desk = path.join(home, "agents", "mrbanks", "workspace");
	write(path.join(desk, "TODO.md"), "# TODO\n\n- [x] Electricity, October: €71.00 · paid 3 Nov\n- [ ] Car insurance: €412.80 by 30 Nov · ref KFZ-88213\n- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n");
	write(path.join(desk, ".gitignore"), "pages/\n");
	gitIn(desk, "init", "-q", "-b", "main");
	gitIn(desk, "add", ".");
	gitIn(desk, "commit", "-q", "-m", "mrbanks");
	const agentsMd = fs.readFileSync(path.join(desk, "AGENTS.md"), "utf8");
	const lastLine = agentsMd.trimEnd().split("\n").pop() + "\n";
	s.teach[1].tools[0].args.edits = [{ oldText: lastLine, newText: `${lastLine}\n## Scans\n\nThe scanner puts letters into ~/Documents/scans. For every new one:\n- say in one line what it is and who sent it\n- the payment details: payee, IBAN, amount, due date, reference\n- a line in TODO.md, with the amount and the date\n` }];

	await open("mrbanks", "main");
	await send("watch ~/Documents/scans. for every letter: what it is, the payment details, a line in TODO.md");
	await (await allow()).click();
	await said(/every conversation/);
	await menu("code-changes");
	await sleep(1200);
	await file("hero-teach", "AGENTS.md");
	await sleep(1000);
	await scene("hero-teach");

	// The letter is scanned. Nobody is at the window.
	fs.copyFileSync(path.join(pine, "reel", "bill", "water-bill.pdf"), path.join(scans, "water-bill.pdf"));
	await page.waitForFunction(() => document.querySelectorAll("[data-slot=message-scroller-content] img").length >= 2, undefined, { timeout: 60_000 });
	await menu("code-changes");
	await sleep(2500);
	await scene("hero-scan");
	await said(/Added to/);
	await sleep(800);
	await file("hero-paid", "TODO.md");
	await sleep(1000);
	await scene("hero-paid");

	// CODE. A project's folder, opened for a conversation of the main agent.
	await open("main", "main");
	await menu(`folder:${shop}`);
	await sees("[data-slot=dialog-title] >> text=Which agent works in");
	await page.keyboard.press("Enter");
	await sees("[data-slot=tab][data-active] [data-slot=tab-name] >> text=shop");
	await send("build the checkout page");
	await said(/charges the cart's total/);
	await menu("code-files");
	await sleep(800);
	await file("code-folder", "src");
	await sleep(600);
	await scene("code-folder");
	git("add", ".");
	git("commit", "-q", "-m", "checkout");
	const session = (await api("GET", "/agents/main/folders")).data.find((u) => u.folder === shop).session;

	// A worktree of its own for the conversation, and Apple Pay in it, committed on its branch.
	const tree = await api("POST", "/agents/main/worktree", { session, name: "apple-pay" });
	if (tree.status && tree.status >= 400) throw new Error(`worktree: ${JSON.stringify(tree)}`);
	await sleep(1200);
	await send("add Apple Pay");
	await said(/Run them/);
	await menu("code-changes");
	await sleep(1500);
	// The branch, where the pane says how far it is from main; its menu is not opened.
	await point("code-branch", panel().getByRole("button", { name: /Worktree|Merge/ }).first());
	await scene("code-branch");

	// What changed on the branch, file by file: what the last message changed (it is committed).
	await menu("code-turn");
	await sleep(1200);
	await file("code-diff", "checkout.tsx");
	await sleep(1000);
	await scene("code-diff");

	// The tests, by the ▶ of the answer's code block, in the terminal beside the conversation.
	await menu("code-terminal");
	await sees("[data-slot=code-panel] [data-slot=terminal]");
	await sleep(1500);
	await click("code-run", page.locator("[data-slot=markdown]", { hasText: "Run them" }).last().locator("[data-run]").first());
	await page.waitForFunction(() => /pass 3/.test(document.querySelector("[data-slot=terminal] .xterm-rows")?.textContent ?? ""), undefined, { timeout: 30_000 });
	await said(/try it in Safari/).catch(() => {});
	await sleep(600);
	await scene("code-run");

	// A goal: the agent goes on until it is reached, with its list of steps.
	await menu("code-changes");
	await point("code-steps", page.locator("[data-slot=composer] textarea"));
	await send("/goal the coupon works, and every test passes");
	await page.waitForFunction(() => /2 of 3 done/.test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), undefined, { timeout: 90_000 });
	await sleep(1200);
	await scene("code-steps");
	await page.waitForFunction(() => /goal · met/.test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), undefined, { timeout: 90_000 });
	await menu("code-changes");
	await sleep(1200);
	await file("code-goal", "cart.ts");
	await sleep(1000);
	await scene("code-goal");

	// The page itself, in the conversation's browser beside it: the agent opens it, the owner allows the local address.
	try {
		await send("open the checkout and show it to me");
		await (await allow("code-browser")).click();
		await said(/Apple Pay sits above/);
		await page.waitForSelector("[data-slot=browser] canvas[data-drawn]", { timeout: 30_000 });
		await page.waitForFunction(() => !document.querySelector("[data-slot=message-scroller-content] [aria-label=Working]"), undefined, { timeout: 15_000 }).catch(() => {});
		await sleep(3000);
		await scene("code-browser");
		await menu("browser");
	} catch (e) {
		console.log("no browser scene:", String(e.message ?? e).split("\n")[0]);
		await page.screenshot({ path: path.join(pictures, "browser-failed.png") });
		await page.keyboard.press("Escape").catch(() => {});
	}

	// EVENTS. Every source wakes an agent, each in a conversation of its own.
	await menu("code-changes"); // the side panel is closed for these: the conversation alone
	await menu("code");
	for (const [agent, source] of [["reviewer", "github"], ["scout", "fridge"], ["postie", "downloads"]]) {
		const r = await api("POST", `/agents/${agent}/subscribe`, { source, session: source, throttle: "1s" });
		if (r.status && r.status >= 400) throw new Error(`subscribe ${source}: ${JSON.stringify(r)}`);
	}
	await sleep(2500);
	for (const e of EVENTS) {
		const name = `ev-${e.key}`;
		if (e.yours) {
			// A short talk in a new conversation: the owner hands over a device's protocol, as a file.
			await open("main", "main");
			await menu("new");
			await sleep(1200);
			await page.locator("input[type=file]").first().setInputFiles(path.join(BASE, "Documents", "protocol.pdf"));
			await sleep(800);
			await send("this is the protocol of our heat pump. can you make an event source for it?");
			await said(/study/);
			await sleep(900);
			await scene(name);
			continue;
		}
		if (e.real === "webhook") {
			await fetch(`http://127.0.0.1:${apiPort}/hook/github`, { method: "POST", headers: { "content-type": "application/json", "x-github-event": "pull_request", "user-agent": "GitHub-Hookshot/7f3a2c1" }, body: JSON.stringify({ action: "opened", number: 42, pull_request: { title: "Add coupon codes", user: { login: "ana" }, additions: 86, deletions: 4, changed_files: 3, base: { ref: "main" }, head: { ref: "coupons" } }, repository: { full_name: "example/shop" } }) }).then((r) => { if (!r.ok) throw new Error(`webhook: ${r.status}`); });
		} else if (e.real === "http") {
			fridge.price = "479.00";
		} else if (e.real === "folder") {
			write(path.join(downloads, "lease-renewal.txt"), LEASE);
		} else {
			const r = await api("POST", "/events", { topic: `source/${e.key}/${e.event}`, payload: e.payload, trust: e.talks ? "owner" : "untrusted" });
			if (r.status && r.status >= 400) throw new Error(`event ${e.key}: ${JSON.stringify(r)}`);
		}
		await open(e.agent, e.key);
		const last = (s[e.real ? { webhook: "pr", http: "price", folder: "lease" }[e.real] : name.replace("-", "_")] ?? []).at(-1)?.text ?? "";
		await said(new RegExp(last.replace(/\*\*|`/g, "").slice(0, 24).replace(/[?.*+()[\]|$^]/g, "\\$&")));
		await sleep(900);
		await scene(name);
		await menu("close");
		await sleep(400);
	}

	// The event log.
	await menu("events");
	await sleep(1500);
	await scene("events-log");

	const css = await page.evaluate(EMIT);
	write(path.join(site, "site", "src", "app.css"), `/* The Pine app's own CSS, cut down to what the shots use and scoped under .pine-shot (scripts/capture.mjs). */\n${css}`);
	for (const sc of Object.values(scenes)) sc.html = await page.evaluate(PRUNE, { html: sc.html, css });
	for (const [name, sc] of Object.entries(scenes)) {
		const data = Object.entries(sc.rootData).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`).join(" ");
		const at = cursor[name] ? ` data-cursor="${cursor[name].join(",")}"` : "";
		write(path.join(out, `${name}.html`), `<div class="pine-shot ${sc.rootClass}" style="${sc.rootStyle.replace(/"/g, "&quot;")}" ${data}${at} inert aria-hidden="true"><div class="pine-body ${sc.bodyClass}">${sc.html}</div></div>\n`);
	}
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
