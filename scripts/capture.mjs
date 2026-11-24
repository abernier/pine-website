// Records what the site's windows play. They are the Pine app itself: its own page (pine's desktop/,
// as built) runs in the site, and instead of a daemon it has a recording of one (site/public/app/reel.js).
// This script makes the recordings: it starts the real app on a pine home of its own, with the scripted
// model server of pine's tests, does what an owner would do (types, clicks) and lets things happen (a
// letter is scanned, a pull request opens), and writes down everything that crosses the app's bridge:
// each call of the page with the daemon's answer, each event, what the terminal printed, and what was
// typed and clicked.
//
//   node scripts/capture.mjs [hero] [code] [events] [log] [--no-build] [path to a pine checkout, default ../pine]
//     -> app/index.html, app/assets/   the app's page, as pine's desktop/ builds it
//        app/stories/<name>.json       the recordings
//        app/media/                    pictures the daemon served while they were made
//
// It needs a Mac, poppler's pdftoppm, and the pine checkout with desktop/ installed (`npm install` there).
// The app's window opens behind your windows and takes no focus. The home and the folders the app shows
// lie under /Users/Shared while it runs (.pine, dev, Documents, Downloads) and are removed at the end.
// Nothing in it is real: the project, the letters, the people and what the agents say are made up.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const site = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const SECTIONS = ["hero", "code", "events", "log"];
const wanted = argv.filter((a) => SECTIONS.includes(a));
const sections = wanted.length ? wanted : SECTIONS;
const pine = path.resolve(argv.find((a) => !a.startsWith("-") && !SECTIONS.includes(a)) ?? path.join(site, "..", "pine"));
const desktop = path.join(pine, "desktop");
const { _electron: electron } = await import(path.join(pine, "node_modules", "playwright-core", "index.mjs"));
const { startMock, textOf } = await import(path.join(pine, "baseline", "tests", "mock.mjs"));

const checkoutVersion = JSON.parse(fs.readFileSync(path.join(pine, "package.json"), "utf8")).version;
/** The newest release's version: its tag on main (a preview's tag says -next). */
const released = execFileSync("git", ["-C", pine, "tag", "--list", "v*", "--sort=-v:refname"], { encoding: "utf8" }).split("\n").find((t) => /^v\d+\.\d+\.\d+$/.test(t))?.slice(1) ?? checkoutVersion;
const out = path.join(site, "app");
const debug = path.join(site, ".capture");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

// ---- the made-up world ----------------------------------------------------------------------------

// Under /Users/Shared, which the app shows as ~. A folder that is there already is somebody's, and the
// script stops rather than touch it.
const BASE = "/Users/Shared";
const made = [".pine", "dev", "Documents", "Downloads"].map((n) => path.join(BASE, n));
for (const p of made) if (fs.existsSync(p)) throw new Error(`${p} exists already. This script makes and removes it; move it away first.`);
const sweep = () => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); };
process.on("exit", sweep);
const home = path.join(BASE, ".pine");
const shop = path.join(BASE, "dev", "shop");
const scans = path.join(BASE, "Documents", "scans");
const downloads = path.join(BASE, "Downloads");

const gitIn = (dir, ...args) => execFileSync("git", ["-C", dir, "-c", "user.name=pine", "-c", "user.email=pine@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
const git = (...args) => gitIn(shop, ...args);

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

/** The folders as they are before anything happened: made anew for each recording. */
function world() {
	sweep();
	fs.mkdirSync(scans, { recursive: true });
	fs.mkdirSync(downloads, { recursive: true });
	write(path.join(shop, "package.json"), '{\n  "name": "shop",\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n');
	write(path.join(shop, "README.md"), "# shop\n\nThe little shop: a cart, a checkout, payments.\n");
	write(path.join(shop, "src", "cart.ts"), 'export type Item = { sku: string; price: number; qty: number };\n\nexport const cart = {\n  items: [] as Item[],\n  add(item: Item) {\n    this.items.push(item);\n  },\n  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n  },\n};\n');
	write(path.join(shop, "src", "pay", "stripe.ts"), 'export const stripe = {\n  async charge(cents: number) {\n    return { ok: cents > 0, id: `ch_${cents}` };\n  },\n};\n');
	write(path.join(shop, "src", "routes.ts"), 'export const routes = {\n  "/": "home",\n  "/cart": "cart",\n};\n');
	write(path.join(shop, "test", "cart.test.ts"), 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { cart } from "../src/cart.ts";\n\ntest("the cart sums its items", () => {\n  cart.add({ sku: "mug", price: 12, qty: 2 });\n  assert.equal(cart.sum(), 24);\n});\n');
	git("init", "-q", "-b", "main");
	git("add", ".");
	git("commit", "-q", "-m", "a cart");
	write(path.join(BASE, "Documents", "protocol.pdf"), PROTOCOL_PDF);
	// The owner's shell in the app's terminal, with a prompt that names nobody, and the made-up world's programs first.
	write(path.join(home, "zsh", ".zshrc"), `PROMPT='%1~ %# '\nunsetopt PROMPT_SP\nexport PATH="${path.join(home, "bin")}:$PATH"\n`);
	// gh, as far as the story needs it: it asks for a secret as GitHub's own does, shows none of it, and says what
	// that one says. It sets nothing anywhere: the repository is as made up as the shop.
	write(path.join(home, "bin", "gh"), `#!/bin/bash
if [ "$1 $2" != "secret set" ]; then echo "gh: only 'secret set' is here" >&2; exit 1; fi
printf '? Paste your secret: '
while IFS= read -r -s -n1 key; do [ -z "$key" ] && break; printf '*'; done
printf '\\n'
sleep 0.7
printf '\\033[32m✓\\033[0m Set Actions secret %s for %s\\n' "$3" "$5"
`);
	fs.chmodSync(path.join(home, "bin", "gh"), 0o755);
}

// ---- the events the sources report ---------------------------------------------------------------
// Three come from sources that really run (a folder, a webhook, a web page); the others are what each
// type reports, in its own words (its topic and its fields, as src/sources/<type>.ts emits them),
// handed to the bus as that source would. Each wakes one agent in a conversation named after the source.

const EVENTS = [
	{ key: "mail", type: "mail", about: "your mail", agent: "postie", event: "mail", payload: { from: "lena.brandt@hv-nord.example", fromName: "Lena Brandt", to: ["you@example.com"], subject: "Heating service on Thursday", date: "2026-11-19T08:12:00Z", text: "Hello,\n\nthe heating in your flat is serviced on Thursday, 27 November, between 9 and 11. Please make sure somebody is at home.\n\nKind regards\nLena Brandt, Hausverwaltung Nord" },
		said: [{ text: "**Lena Brandt** of the property management: the heating is serviced on **Thursday 27 Nov, 9–11**, and somebody has to be at home.\n\nNothing else is in your calendar then. Shall I put it in?" }] },
	{ key: "slack", type: "slack", about: "#deploys", agent: "ops", event: "message", payload: { text: "checkout throws 500s since the last deploy?? <@ops>", user: "U04A1MAYA", userName: "maya", channel: "C01DEPLOY", channelName: "deploys", kind: "channel", ts: "1763542921.000200", why: "mention", mention: "me" },
		said: [{ tools: [{ name: "bash", args: { command: `git -C ${shop} log --oneline -3` } }] }, { text: "maya asks in **#deploys** about 500s on the checkout. The last deploy is the commit **checkout**, the first with that page: it charges through Stripe, and the server has no Stripe key yet.\n\nRoll back, or set `STRIPE_KEY` there." }] },
	{ key: "telegram", type: "telegram", about: "your phone", agent: "main", event: "message", talks: true, payload: { text: "what did the fridge end up costing?", name: "Robin", username: "robin", chatId: 4242, messageId: 118 },
		said: [{ text: "**€479.** scout saw the price drop on Tuesday morning, and you bought it the same day." }] },
	{ key: "discord", type: "discord", about: "the shop's server", agent: "reviewer", event: "message", payload: { text: "the checkout button does nothing in Firefox since 2.3 😕", user: "381920114", userName: "kiki", channel: "99210", channelName: "bugs", guild: "shop community" },
		said: [{ tools: [{ name: "read", args: { path: path.join(shop, "src", "checkout.tsx") } }] }, { text: "kiki reports in **#bugs**: the checkout button does nothing in Firefox since 2.3. The button only calls `stripe.charge`; the browser's console will say more. I wrote it up as an issue for you to look at." }] },
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
	{ tools: [{ name: "create_agent", args: { id: "mrbanks", description: "Keeps the bills", instructions: "You are mrbanks. You keep your owner's bills: what is to be paid, to whom and by when.\nKeep the open ones in TODO.md, one line each.\n" } }] },
	{ text: "**mrbanks** is there. It is in the sidebar; tell it what to watch." },
];
s.teach = [
	{ tools: [{ name: "add_source", args: { name: "scans", type: "folder", description: "the scanner's folder", options: { dir: scans }, note: "A letter was scanned: say what it is, the payment details, and add it to TODO.md." } }] },
	{ tools: [{ name: "edit", args: { path: "AGENTS.md", edits: [] } }] },
	{ text: "Watching `~/Documents/scans`. The job is in my `AGENTS.md`, so I know it whenever I wake." },
];
s.bill = [
	{ tools: [{ name: "bash", args: { command: `mkdir -p pages && pdftoppm -r 40 -png ${scans}/water-bill.pdf pages/water-bill` } }], delayMs: 900 },
	{ tools: [{ name: "read", args: { path: "pages/water-bill-1.png" } }, { name: "read", args: { path: "pages/water-bill-2.png" } }], delayMs: 900 },
	// The pause before this one is where the chapter turns (see hero()).
	{ tools: [{ name: "edit", args: { path: "TODO.md", edits: [{ oldText: "- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n", newText: "- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n- [ ] Water, Stadtwerke Musterstadt: €219.41 by 26 Nov · ref WA-2026-104233\n      IBAN DE89 3704 0044 0532 0130 00\n" }] } }], delayMs: 3500 },
	{ text: "A **water bill**, 2 pages.\n\n| To pay | |\n|---|---|\n| Payee | Stadtwerke Musterstadt GmbH |\n| IBAN | DE89 3704 0044 0532 0130 00 |\n| BIC | COBADEFFXXX |\n| Amount | **€219.41** |\n| Due | 26 Nov 2026 |\n| Reference | WA-2026-104233 |\n\nThe prepayment goes up to **€49.00** a month from 15 Dec. Added to `TODO.md`." },
];
s.checkout = [
	{ tools: [{ name: "read", args: { path: "src/cart.ts" } }] },
	{ tools: [{ name: "write", args: { path: "src/checkout.tsx", content: CHECKOUT } }] },
	{ tools: [{ name: "edit", args: { path: "src/routes.ts", edits: [{ oldText: '  "/cart": "cart",\n', newText: '  "/cart": "cart",\n  "/checkout": "checkout",\n' }] } }] },
	{ tools: [{ name: "bash", args: { command: "npm test" } }] },
	{ text: "The checkout page is in `src/checkout.tsx`, at `/checkout`. It charges the cart's total through Stripe, and the tests pass." },
];
s.applepay = [
	{ tools: [{ name: "write", args: { path: "src/pay/apple.ts", content: APPLE } }] },
	{ tools: [{ name: "edit", args: { path: "src/checkout.tsx", edits: [{ oldText: 'import { stripe } from "./pay/stripe.ts";\n', newText: 'import { stripe } from "./pay/stripe.ts";\nimport { applePay } from "./pay/apple.ts";\n' }, { oldText: "    <Pay total={total}>\n", newText: "    <Pay total={total}>\n      {applePay.available() && <ApplePay onPay={() => applePay.charge(total * 100)} />}\n" }] } }] },
	{ tools: [{ name: "write", args: { path: "test/apple.test.ts", content: APPLE_TEST } }] },
	{ tools: [{ name: "bash", args: { command: "npm test 2>&1 | tail -8" } }] },
	{ tools: [{ name: "bash", args: { command: "git add -A && git commit -qm 'Apple Pay' && git log --oneline -2" } }] },
	{ text: "Apple Pay is in, behind a check for the wallet, with two tests of its own. All 3 tests pass, and it is committed on its branch." },
];
// A command that takes a secret is the owner's to run: the agent hands it over, hears how it went, and goes on.
s.secret = [{ text: "The deploy reads the key from the repository's secrets. The key is yours and I should not see it, so run this, and paste the key when it asks:\n\n```bash\ngh secret set STRIPE_KEY --repo example/shop\n```\n\nI go on when it is set." }];
s.ran = [
	{ tools: [{ name: "edit", args: { path: "README.md", edits: [{ oldText: "The little shop: a cart, a checkout, payments.\n", newText: "The little shop: a cart, a checkout, payments.\n\nThe deploy reads `STRIPE_KEY` from the repository's secrets.\n" }] } }] },
	{ text: "`STRIPE_KEY` is set for example/shop, and I never saw it. The deploy can charge now; I noted in the README where the key comes from." },
];
const steps = (...st) => ({ tools: [{ name: "todo", args: { items: [["Write a test for the coupon", st[0]], ["Take the coupon off the total", st[1]], ["Run all the tests", st[2]]].map(([text, status]) => ({ text, status })) } }] });
s.goal1 = [
	steps("in_progress", "pending", "pending"),
	{ tools: [{ name: "write", args: { path: "test/coupon.test.ts", content: COUPON_TEST } }] },
	steps("done", "in_progress", "pending"),
	{ tools: [{ name: "bash", args: { command: "npm test 2>&1 | tail -4" } }] },
	{ text: "The coupon's test is there, and fails as it should: the cart has no coupon yet. That comes next." },
];
s.goal2 = [
	// The pause before this one is where the chapter turns (see code()).
	{ tools: [{ name: "edit", args: { path: "src/cart.ts", edits: [{ oldText: "  sum() {\n    return this.items.reduce((s, i) => s + i.price * i.qty, 0);\n", newText: "  coupon: 0,\n  sum() {\n    const total = this.items.reduce((s, i) => s + i.price * i.qty, 0);\n    return total * (1 - this.coupon);\n" }] } }], delayMs: 3500 },
	steps("done", "done", "in_progress"),
	{ tools: [{ name: "bash", args: { command: "npm test 2>&1 | tail -4" } }] },
	steps("done", "done", "done"),
	{ text: "All 4 tests pass, the coupon's too: 10% off €24.00 is €21.60." },
];
s.browser = [
	{ tools: [{ name: "mcp__browser__browser_navigate", args: { url: "" } }] },
	{ tools: [{ name: "mcp__browser__browser_show", args: {} }] },
	{ text: "The checkout is up: Apple Pay sits above the card form, and the total is right." },
];
s.pr = [
	{ tools: [{ name: "read", args: { path: path.join(shop, "src", "cart.ts") } }] },
	{ text: "**#42 Add coupon codes** by ana, in example/shop: 3 files, +86 −4.\n\nIt reads well. One thing: the coupon comes off after tax, so a 10% coupon takes 10% of the tax too. Worth a word before it is merged." },
];
s.price = [{ text: "The **Fridge 3000** is down to **€479.00**, from €549.00 this morning. That is under the €500 you wanted to pay." }];
s.lease = [
	{ tools: [{ name: "read", args: { path: path.join(downloads, "lease-renewal.txt") } }] },
	{ text: "The **lease renewal**: from January the rent is **€1,060.90**, 3% more. The notice period stays three months. Sign and return it by **15 December**." },
];
s.yours = [{ text: "No problem. I'll study `protocol.pdf` and add a source for it, unless one of the types we have covers it already: a heat pump often speaks Modbus, and that one is there." }];
for (const e of EVENTS) if (e.said) s[`ev_${e.key}`] = e.said;
// The pace of the model: a moment before each tool call, and words that come as words do.
for (const script of Object.values(s)) for (const step of script) {
	if (step.tools) step.delayMs ??= 650;
	if (step.text) (step.delayMs ??= 500), (step.chunkDelayMs ??= 75);
}

/** Which script a request is for, by what its last message says. The message itself stays as it came. */
const MEANS = [
	[/^new agent: mrbanks/, "make"], [/^watch ~\/Documents\/scans/, "teach"], [/water-bill\.pdf/, "bill"],
	[/^build the checkout page/, "checkout"], [/^add Apple Pay/, "applepay"], [/^the deploy needs my Stripe key/, "secret"], [/ran a command from your answer/, "ran"], [/^open the checkout/, "browser"],
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
const freePort = () => new Promise((r) => { const t = http.createServer().listen(0, "127.0.0.1", () => { const p = t.address().port; t.close(() => r(p)); }); });
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

/** What a subscription of `agent` to source `key` amounts to (SourceHost.route in pine's src/sources.ts), for a source the script reports for. */
const routeOf = (e) => {
	const what = `${e.type}: ${e.about}`;
	const base = { name: `sub:${e.agent}:${e.key}:${e.key}`, on: [`source/${e.key}/#`], key: "subscription", agent: e.agent, session: e.key, label: `${e.key}: {{topic}}`, trust: "owner" };
	if (e.talks) return { ...base, prompt: "{{payload.text}}", label: `${e.key}: {{payload.name}}`, preface: `[Your owner wrote this to you through "${e.key}" (${what}). Your answer is sent back there, so write it for that reader.]` };
	return { ...base, whole: true, preface: `[You are subscribed to the event source "${e.key}" (${what}), and it has just reported the event below. Act on it as your instructions say. If nothing needs doing, say so in one line.]`, taint: `an event from the source "${e.key}"` };
};
let apiPort = 0;
async function pineHome() {
	apiPort = await freePort();
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
	write(path.join(home, "desktop-data", "prefs.json"), JSON.stringify({ theme: "dark", notify: false, updates: false, bounds: { width: 1280, height: 800 } }));
}

// ---- the app, and what is written down of it ---------------------------------------------------------

let app, page;
/** Everything that happened, with its time: what crossed the bridge (from the main process), and what the owner did. */
let R = [];
/** Pictures the daemon served: the address the page asked for, without what only makes it new -> the file, or the files over time. */
let media = {};
let story = "";
let pictureCount = 0;
const used = new Set();

/** In the main process: every answer to the page and everything sent to it is noted, with its time. */
async function listen() {
	await app.evaluate(({ ipcMain, BrowserWindow }) => {
		const rec = (globalThis.__rec = []);
		const handlers = ipcMain._invokeHandlers;
		if (!handlers?.size) throw new Error("this Electron keeps its handlers elsewhere");
		for (const [channel, fn] of [...handlers]) {
			if (!channel.startsWith("pine:")) continue;
			ipcMain.removeHandler(channel);
			ipcMain.handle(channel, async (e, ...a) => {
				const at = Date.now();
				const r = await fn(e, ...a);
				rec.push({ k: "invoke", ch: channel, at, t: Date.now(), a, r });
				return r;
			});
		}
		const contents = BrowserWindow.getAllWindows()[0].webContents;
		const send = contents.send.bind(contents);
		contents.send = (channel, ...a) => {
			if (String(channel).startsWith("pine:")) rec.push({ k: "send", ch: channel, t: Date.now(), a });
			return send(channel, ...a);
		};
	});
}
const drain = async () => void R.push(...(await app.evaluate(() => globalThis.__rec.splice(0))));
/** Until nothing has crossed the bridge for a while. */
async function quiet(ms = 450, most = 12_000) {
	const from = Date.now();
	let last = from, n = -1;
	for (;;) {
		await drain();
		if (R.length !== n) (n = R.length), (last = Date.now());
		if (Date.now() - last >= ms || Date.now() - from > most) return;
		await sleep(110);
	}
}

/** What an act is done to: the first thing on the page that fits and can be seen. (reel.js finds it the same way.) */
const FIND = (spec) => {
	const re = spec.text ? new RegExp(spec.text) : null;
	const list = [...document.querySelectorAll(spec.sel)].filter((el) => {
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && (!re || re.test((el.textContent ?? "").trim()));
	});
	return list[spec.last ? list.length - 1 : (spec.nth ?? 0)] ?? null;
};
const note = (k, a) => void R.push({ k, t: Date.now(), a });
async function click(spec, more = {}) {
	const el = (await page.waitForFunction(FIND, spec, { timeout: 30_000 })).asElement();
	if (process.env.TRACE) console.log("  click", JSON.stringify(spec), "->", await el.evaluate((e) => `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)}" at ${Math.round(e.getBoundingClientRect().left)},${Math.round(e.getBoundingClientRect().top)}`));
	note("act", { do: "click", ...spec, ...more });
	await el.click();
	await sleep(350);
}
const COMPOSER = { sel: "[data-slot=composer] textarea" };
/** The owner writes a message and sends it. */
async function tell(text) {
	await page.waitForFunction(FIND, COMPOSER, { timeout: 30_000 });
	note("act", { do: "type", ...COMPOSER, value: text });
	await page.fill(COMPOSER.sel, text);
	await sleep(120);
	note("act", { do: "key", key: "Enter" });
	await page.keyboard.press("Enter");
}
/** Something a menu of the app does (its menu bar is not in the window). */
async function menu(command) {
	note("act", { do: "menu", command });
	await app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send("pine:menu", c), command);
	await sleep(300);
}
const api = (method, url, body) => page.evaluate(([m, u, b]) => window.pine.call(m, u, b), [method, url, body]);
const said = (re, timeout = 60_000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), re.source, { timeout });
const sees = (selector, timeout = 30_000) => page.waitForSelector(selector, { timeout });
/** The owner's yes in pine's question. */
const ALLOW = { sel: "[data-slot=dialog-content] button, [data-slot=alert-dialog-content] button", text: "^(Allow|Create|Yes|Add)" };
/** The hand leaves the window. */
const rest = () => note("act", { do: "rest" });
/** What is on the screen stays for a while. */
const hold = (ms) => note("mark", { hold: ms });
/** A part of the story ends here: what plays from a checkpoint plays up to this. */
const end = () => note("mark", { end: true });

/**
 * A place the story can be started from. The app that starts there asks the daemon for everything, as a
 * window that was just opened does, so everything the page ever asked is asked again here and the answers
 * of this moment are in the recording. `setup` is what brings a window that was just opened to what the
 * window in the recording shows by now (which view of the side panel, which file).
 */
async function checkpoint(name, setup = []) {
	await quiet();
	const urls = [...new Set(R.filter((e) => e.k === "invoke" && e.ch === "pine:call" && e.a[0] === "GET").map((e) => e.a[1]))];
	await page.evaluate(async (list) => { await Promise.all(list.map((u) => window.pine.call("GET", u).catch(() => undefined))); }, urls);
	await drain();
	note("mark", { checkpoint: name, ...(setup.length ? { setup } : {}) });
	console.log(`  checkpoint ${name} (${urls.length} addresses asked again)`);
}

const pictureKey = (url) => url.replace(/^pine-media:\/\/[^/]*/, "").replace(/([?&])n=\d+&?/, "$1").replace(/[?&]$/, "");
async function fetched(url) {
	return app.evaluate(async ({ net }, u) => {
		const r = await net.fetch(u);
		if (!r.ok) return undefined;
		return { type: r.headers.get("content-type") ?? "image/png", b64: Buffer.from(await r.arrayBuffer()).toString("base64") };
	}, url).catch(() => undefined);
}
const keep = (data) => {
	const ext = /jpe?g/.test(data.type) ? "jpg" : /webp/.test(data.type) ? "webp" : "png";
	const file = `media/${story}-${++pictureCount}.${ext}`;
	write(path.join(out, file), Buffer.from(data.b64, "base64"));
	return file;
};
/** The pictures the page shows from the daemon are kept as files. */
async function pictures() {
	const srcs = await page.evaluate(() => [...new Set([...document.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").filter((x) => x.startsWith("pine-media:")))]);
	for (const src of srcs) {
		if (media[pictureKey(src)]) continue;
		const data = await fetched(src);
		if (data) media[pictureKey(src)] = keep(data);
		else console.log("  a picture was not kept:", src);
	}
}
/** The page of a conversation's browser, as the daemon draws it now. */
async function browserFrame(agent, session, tries = 40) {
	const url = `pine-media://daemon/agents/${agent}/browser/frame?session=${encodeURIComponent(session)}&n=1`;
	for (let i = 0; i < tries; i++) {
		const data = await fetched(url);
		if (data && data.b64.length > 4000) return void (media[pictureKey(url)] ??= []).push([Date.now(), keep(data)]);
		await sleep(400);
	}
	console.log("  no picture of the browser");
}

async function start(name) {
	story = name;
	R = [];
	media = {};
	pictureCount = 0;
	judged = 0;
	fridge.price = "549.00";
	world();
	await pineHome();
	for (const f of fs.existsSync(path.join(out, "media")) ? fs.readdirSync(path.join(out, "media")) : []) if (f.startsWith(`${name}-`)) fs.rmSync(path.join(out, "media", f));
	app = await electron.launch({
		executablePath: path.join(desktop, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron"),
		colorScheme: "dark",
		args: [desktop],
		env: {
			...process.env, PINE_HOME: home, PINE_DESKTOP_DATA: path.join(home, "desktop-data"), PINE_SKIP_DOWNLOADS: "1", PINE_DESKTOP_DEV_URL: "", PINE_DESKTOP_RELEASES: "", PINE_DESKTOP_BACKGROUND: "1",
			// The terminal's shell reads its startup files from here (world() writes them): a prompt that names nobody.
			SHELL: "/bin/zsh", ZDOTDIR: path.join(home, "zsh"), PINE_DESKTOP_STILL_RUNNING_MS: "60000",
			GIT_AUTHOR_NAME: "pine", GIT_AUTHOR_EMAIL: "pine@example.invalid", GIT_COMMITTER_NAME: "pine", GIT_COMMITTER_EMAIL: "pine@example.invalid",
		},
	});
	page = await app.firstWindow();
	page.on("pageerror", (e) => console.log("  error in the page:", String(e.message)));
	// Which of the app's files the page loads: only those go to the site.
	page.on("request", (r) => { if (/\/assets\//.test(r.url())) used.add(path.basename(new URL(r.url()).pathname)); });
	await sees("[data-slot=composer] textarea", 90_000);
	const notNow = page.locator("[data-slot=dialog-footer]").getByRole("button", { name: "Not now" });
	if (await notNow.isVisible({ timeout: 2000 }).catch(() => false)) await notNow.click();
	// From here on everything is written down; the page is loaded anew so that its start is in it too.
	await listen();
	await page.reload();
	await sees("[data-slot=composer] textarea", 60_000);
	await page.evaluate(() => performance.setResourceTimingBufferSize(4000));
	await quiet(600);
}

/** The recording, as the page that plays it reads it (see site/public/app/reel.js). */
function finish({ feed = false } = {}) {
	R.sort((a, b) => (a.at ?? a.t) - (b.at ?? b.t));
	const first = R.find((e) => e.k === "mark" && e.a.checkpoint);
	if (!first) throw new Error(`${story}: no checkpoint`);
	const rel = (t) => Math.round(t - first.t);
	const pool = [];
	const index = new Map();
	const calls = {};
	const tabs = [];
	const invoke = {};
	const tl = [];
	let state;
	const SHORT = /^GET \/tasks\?limit=1000$/;
	for (const e of R) {
		if (e.k === "invoke" && e.ch === "pine:call") {
			const [method, url, body] = e.a;
			const key = `${method} ${url}`;
			if (key === "POST /ui/tabs") { tabs.push([rel(e.at), { tabs: body.tabs, active: body.active, code: body.code === true }]); continue; }
			if (key === "GET /ui/tabs") { if (e.r?.ok) tabs.push([rel(e.at), e.r.data]); continue; }
			let r = e.r;
			// What was said lately, in every conversation: the page only names conversations by it, and that takes its first words.
			if (SHORT.test(key) && r?.ok && Array.isArray(r.data)) r = { ...r, data: r.data.map((t) => ({ ...t, prompt: String(t.prompt ?? "").slice(0, 100), result: t.result ? String(t.result).slice(0, 100) : t.result })) };
			const text = JSON.stringify(r);
			if (!index.has(text)) (index.set(text, pool.length), pool.push(r));
			(calls[key] ??= []).push([rel(e.at), index.get(text)]);
		} else if (e.k === "invoke" && e.ch === "pine:state") state = e.r;
		else if (e.k === "invoke") { if (["pine:term-open", "pine:term-run", "pine:pick-folder"].includes(e.ch)) (invoke[e.ch] ??= []).push([rel(e.at), e.r]); }
		else if (e.k === "send") { if (["pine:events", "pine:term-data", "pine:term-exit", "pine:term-run", "pine:init-line"].includes(e.ch)) tl.push([rel(e.t), "send", e.ch, e.a]); }
		else tl.push([rel(e.t), e.k, e.a]);
	}
	tabs.sort((a, b) => a[0] - b[0]);
	const data = { name: story, epoch: first.t, state, tl: tl.filter((e) => e[0] >= 0), calls, pool, tabs, invoke, media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, Array.isArray(v) ? v.map(([t, f]) => [rel(t), f]) : v])) };
	// For a log that never ends: what the sources reported and what the agents did about it, in the order it came.
	if (feed) {
		data.feed = R.filter((e) => e.k === "send" && e.ch === "pine:events").flatMap((e) => e.a[0]).filter((ev) => !/\/(delta|thinking|message)$/.test(ev.topic) && !/^(pine|approval)\//.test(ev.topic));
	}
	let text = JSON.stringify(data);
	// Nothing of the person who made the recording is in it.
	const me = os.userInfo();
	for (const [what, as] of [[me.homedir, "/Users/you"], [os.hostname(), "mac"], [os.hostname().replace(/\.local$/, ""), "mac"]]) if (what && what.length > 2) text = text.replaceAll(what, as);
	// A checkout's package.json keeps a version pine never bumps (releases take theirs from the commits):
	// the windows say the version of pine's latest release instead.
	text = text.replaceAll(`"version":${JSON.stringify(checkoutVersion)}`, `"version":${JSON.stringify(released)}`);
	// (The user's name alone may be a word like any other: it counts where it stands for the user, before an @.)
	const mine = [`${me.username}@`, ...["user.name", "user.email"].map((k) => { try { return execFileSync("git", ["config", "--global", k], { encoding: "utf8" }).trim(); } catch { return ""; } })].filter((x) => x && x.length > 2);
	for (const x of mine) if (text.includes(x)) throw new Error(`${story}: the recording names you (${JSON.stringify(x)}), here: …${text.slice(Math.max(0, text.indexOf(x) - 160), text.indexOf(x) + 80)}…`);
	write(path.join(out, "stories", `${story}.json`), text);
	const marks = tl.filter((e) => e[1] === "mark" && e[2].checkpoint).map((e) => e[2].checkpoint);
	console.log(`${story}: ${Math.round(text.length / 1024)} KB · ${tl.length} entries · ${Object.keys(calls).length} addresses · ${pool.length} answers · ${Object.keys(media).length} pictures · from ${marks.join(", ")}`);
}

async function stop() {
	for (const name of await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name)).catch(() => [])) used.add(path.basename(new URL(name).pathname));
	await app.close().catch(() => {});
	await sleep(1500);
}
/** What the window shows when something does not come: a picture, and what is on the page. */
async function failed(e) {
	fs.mkdirSync(debug, { recursive: true });
	await page?.screenshot({ path: path.join(debug, `${story}-failed.png`) }).catch(() => {});
	const html = await page?.evaluate(() => document.body.innerHTML).catch(() => "");
	write(path.join(debug, `${story}-failed.html`), html ?? "");
	console.error(e);
	console.error("the model was asked:", asked.slice(-6));
	process.exitCode = 1;
}

// ---- the stories -------------------------------------------------------------------------------------

/** An agent for the bills: the main agent makes it, the owner tells it what to watch, a letter is scanned, and it is on the list. */
async function hero() {
	const PANEL = "[data-slot=code-panel]";
	await checkpoint("make");
	await tell("new agent: mrbanks, for my bills. same model");
	rest();
	await click(ALLOW);
	await said(/tell it what to watch/);
	await quiet();
	hold(1400);

	// Between the chapters, behind the window: the new agent's folder gets a list and a history, so that changes show.
	const desk = path.join(home, "agents", "mrbanks", "workspace");
	write(path.join(desk, "TODO.md"), "# TODO\n\n- [x] Electricity, October: €71.00 · paid 3 Nov\n- [ ] Car insurance: €412.80 by 30 Nov · ref KFZ-88213\n- [ ] Dentist: €86.40 by 4 Dec · ref R-2026-0912\n");
	write(path.join(desk, ".gitignore"), "pages/\n");
	gitIn(desk, "init", "-q", "-b", "main");
	gitIn(desk, "add", ".");
	gitIn(desk, "commit", "-q", "-m", "mrbanks");
	const lastLine = fs.readFileSync(path.join(desk, "AGENTS.md"), "utf8").trimEnd().split("\n").pop() + "\n";
	s.teach[1].tools[0].args.edits = [{ oldText: lastLine, newText: `${lastLine}\n## Scans\n\nThe scanner puts letters into ~/Documents/scans. For each new one:\n- say in one line what it is and who sent it\n- the payment details: payee, IBAN, amount, due date, reference\n- a line in TODO.md, with the amount and the date\n` }];

	await checkpoint("tell");
	await click({ sel: "[data-slot=agent-conversation]:has([data-agent=mrbanks])" });
	await sees('[data-slot=tab][data-active] >> text=mrbanks');
	await quiet();
	await tell("watch ~/Documents/scans. for each letter: what it is, the payment details, a line in TODO.md");
	rest();
	await click(ALLOW);
	await said(/whenever I wake/);
	await quiet();
	hold(700);
	// What it wrote into its own instructions, beside the conversation.
	await click({ sel: "[data-toggle=code]" });
	await click({ sel: `${PANEL} [role=tab]`, text: "^Changes$" });
	await click({ sel: `${PANEL} [role=option]`, text: "AGENTS\\.md" });
	await quiet();
	hold(2600);
	rest();

	// The letter is scanned. Nobody is at the window.
	const DIFF = [{ do: "menu", command: "code-changes" }, { do: "click", sel: `${PANEL} [role=option]`, text: "AGENTS\\.md" }];
	await checkpoint("wake", DIFF);
	hold(900);
	fs.copyFileSync(path.join(import.meta.dirname, "water-bill.pdf"), path.join(scans, "water-bill.pdf"));
	await page.waitForFunction(() => document.querySelectorAll("[data-slot=message-scroller-content] img").length >= 2, undefined, { timeout: 60_000 });
	await pictures();
	// The model takes its time before it writes the line (s.bill): the chapter turns in that pause.
	await checkpoint("due", DIFF);
	await said(/Added to/);
	await quiet();
	hold(900);
	await click({ sel: `${PANEL} [aria-label="Back to the list"]` });
	await click({ sel: `${PANEL} [role=option]`, text: "TODO\\.md" });
	await quiet();
	hold(4200);
	rest();
	end();
	await pictures();
}

/** A folder, a worktree, a diff, the terminal, a goal with its steps, the browser: one conversation, with the hand at work. */
async function code() {
	const PANEL = "[data-slot=code-panel]";
	const TAB = (name) => ({ sel: `${PANEL} [role=tab]`, text: `^${name}` });
	// A project's folder, opened for a conversation of the main agent, with its files beside it.
	await menu(`folder:${shop}`);
	await sees("[data-slot=dialog-title] >> text=Which agent works in");
	await page.keyboard.press("Enter");
	await sees("[data-slot=tab][data-active] [data-slot=tab-name] >> text=shop");
	// (The panel's first view, once: what it asks for is then in the recording, for a window that starts with it.)
	await menu("code-agent");
	await sleep(900);
	await menu("code-files");
	await sees(`${PANEL} [aria-label=Files]`);

	await checkpoint("folder", [{ do: "menu", command: "code-files" }]);
	await tell("build the checkout page");
	rest();
	await said(/charges the cart's total/);
	await quiet();
	hold(500);
	await click({ sel: `${PANEL} [aria-label=Files] *`, text: "^src$", last: true });
	await click({ sel: `${PANEL} [aria-label=Files] *`, text: "^checkout\\.tsx$", last: true });
	await quiet();
	hold(2600);
	git("add", ".");
	git("commit", "-q", "-m", "checkout");

	// A worktree of its own for the conversation, and Apple Pay in it, committed on its branch.
	await checkpoint("worktree", [{ do: "menu", command: "code-files" }]);
	await menu("worktree");
	await click({ sel: "[data-slot=command-item]", text: "^Make a worktree" });
	await said(/now works in the worktree/);
	await quiet();
	hold(900);
	await tell("add Apple Pay");
	rest();
	await said(/committed on its branch/);
	await quiet();
	hold(400);
	await click(TAB("Changes"));
	await quiet();
	hold(2400);

	// What the last message changed, file by file.
	await checkpoint("diff", [{ do: "menu", command: "code-changes" }]);
	await click(TAB("Last turn"));
	await click({ sel: `${PANEL} [role=option]`, text: "checkout\\.tsx" });
	await quiet();
	hold(3000);

	// What needs a secret is the owner's to run: by the ▶ of the answer's code block, in the terminal beside the
	// conversation, where the key is pasted. The agent hears how it went, and goes on.
	const shown = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-slot=terminal] .xterm-rows")?.textContent ?? ""), re.source, { timeout: 30_000 });
	await checkpoint("run", [{ do: "menu", command: "code-turn" }]);
	await tell("the deploy needs my Stripe key");
	rest();
	await said(/I go on when it is set/);
	await quiet();
	hold(900);
	await click({ sel: "[data-slot=markdown] [data-run]", last: true });
	await shown(/Paste your secret/);
	await sleep(500);
	hold(500);
	// Into the terminal, and the key from the clipboard. (What is pasted is no key, and none of it is kept.)
	await click({ sel: "[data-slot=terminal]" });
	await sleep(700);
	await page.keyboard.insertText("made-up-not-a-key-0000");
	await sleep(900);
	await page.keyboard.press("Enter");
	await shown(/Set Actions secret/);
	await said(/I never saw it/);
	await quiet();
	hold(2600);

	// A goal: the agent keeps a list of steps and goes on, round after round, until the goal is reached.
	await checkpoint("steps", [{ do: "menu", command: "code-changes" }]);
	await click(TAB("Changes"));
	await tell("/goal the coupon works, and all tests pass");
	rest();
	await said(/That comes next/, 90_000);
	// The second round starts with a pause of the model (s.goal2): the chapter turns in it.
	await page.waitForFunction(() => /round 2/.test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), undefined, { timeout: 60_000 }).catch(() => console.log("  no line for the second round"));
	await checkpoint("goal", [{ do: "menu", command: "code-changes" }]);
	await page.waitForFunction(() => /goal · met/.test(document.querySelector("[data-slot=message-scroller-content]")?.textContent ?? ""), undefined, { timeout: 90_000 });
	await quiet();
	hold(700);
	await click({ sel: `${PANEL} [role=option]`, text: "cart\\.ts" });
	await quiet();
	hold(3000);

	// The page itself, in the conversation's browser: the agent opens it, the owner allows the local address.
	await checkpoint("browser", [{ do: "menu", command: "code-changes" }]);
	await tell("open the checkout and show it to me");
	rest();
	await click(ALLOW);
	await said(/Apple Pay sits above/);
	const session = (await api("GET", "/agents/main/folders")).data.find((u) => u.folder === shop || String(u.folder).includes("shop")).session;
	await browserFrame("main", session);
	await quiet();
	hold(4500);
	end();
}

/** Every source wakes an agent, each in a conversation of its own, whose tab is open when it happens. */
async function events() {
	for (const [agent, source] of [["reviewer", "github"], ["scout", "fridge"], ["postie", "downloads"]]) {
		const r = await api("POST", `/agents/${agent}/subscribe`, { source, session: source, throttle: "1s" });
		if (r.status && r.status >= 400) throw new Error(`subscribe ${source}: ${JSON.stringify(r)}`);
	}
	await sleep(2500);
	for (const e of EVENTS) {
		const session = e.yours ? "heatpump" : e.key;
		// The window as it is before the event: the conversation the event belongs to, in front, with nothing in it yet.
		await api("POST", "/ui/tabs", { tabs: [{ agent: "main", session: "main" }, { agent: e.agent, session }], active: 1, code: false });
		await page.reload();
		await sees(`[data-slot=tab][data-active] >> text=${e.agent}`, 60_000);
		await checkpoint(`ev-${e.key}`);
		hold(500);
		if (e.yours) {
			// The owner hands over a device's protocol, as a file.
			note("act", { do: "attach", sel: "input[type=file]", name: "protocol.pdf", type: "application/pdf", content: PROTOCOL_PDF });
			await page.locator("input[type=file]").first().setInputFiles(path.join(BASE, "Documents", "protocol.pdf"));
			await sleep(800);
			await tell("this is the protocol of our heat pump. can you make an event source for it?");
			await said(/study/);
		} else {
			if (e.real === "webhook") {
				await fetch(`http://127.0.0.1:${apiPort}/hook/github`, { method: "POST", headers: { "content-type": "application/json", "x-github-event": "pull_request", "user-agent": "GitHub-Hookshot/7f3a2c1" }, body: JSON.stringify({ action: "opened", number: 42, pull_request: { title: "Add coupon codes", user: { login: "ana" }, additions: 86, deletions: 4, changed_files: 3, base: { ref: "main" }, head: { ref: "coupons" } }, repository: { full_name: "example/shop" } }) }).then((r) => { if (!r.ok) throw new Error(`webhook: ${r.status}`); });
			} else if (e.real === "http") fridge.price = "479.00";
			else if (e.real === "folder") write(path.join(downloads, "lease-renewal.txt"), LEASE);
			else {
				const r = await api("POST", "/events", { topic: `source/${e.key}/${e.event}`, payload: e.payload, trust: e.talks ? "owner" : "untrusted" });
				if (r.status && r.status >= 400) throw new Error(`event ${e.key}: ${JSON.stringify(r)}`);
			}
			const last = (s[e.real ? { webhook: "pr", http: "price", folder: "lease" }[e.real] : `ev_${e.key}`] ?? []).at(-1)?.text ?? "";
			// The first words of the answer; what follows them is waited for below, until nothing comes any more.
			await said(new RegExp(last.replace(/\*\*|`/g, "").slice(0, 24).replace(/[?.*+()[\]|$^]/g, "\\$&")));
		}
		await quiet();
		hold(3200);
		end();
		console.log(`  ${e.key}`);
	}
}

/** The event log, with things in it, and from there on what the sources report without end. */
async function log() {
	for (const e of EVENTS.filter((x) => x.payload !== undefined)) {
		await api("POST", "/events", { topic: `source/${e.key}/${e.event}`, payload: e.payload, trust: e.talks ? "owner" : "untrusted" });
		await sleep(900);
	}
	await page.waitForFunction(() => !document.querySelector("[data-slot=sidebar] [aria-label=Working], [data-sidebar] [aria-label=Working]"), undefined, { timeout: 60_000 }).catch(() => {});
	await sleep(4000);
	// The window on the site is the log alone: the side bar is put away.
	await checkpoint("log", [{ do: "menu", command: "sidebar" }]);
	await menu("events");
	await sees('[aria-label="Events"]');
	await quiet();
	note("mark", { feed: true });
}

// ---- the app's page, and the recordings --------------------------------------------------------------

if (!argv.includes("--no-build") || !fs.existsSync(path.join(desktop, "dist", "index.html"))) execFileSync(process.execPath, [path.join(desktop, "scripts", "build.mjs")], { stdio: "inherit" });
const STORIES = { hero, code, events, log };
for (const name of sections) {
	console.log(`recording ${name}`);
	try {
		await start(name);
		await STORIES[name]();
		await drain();
		finish({ feed: name === "log" });
	} catch (e) {
		await failed(e);
	} finally {
		await stop();
	}
	if (process.exitCode) break;
}

// The page of the app: its index.html with the player in front of it, and of its files those a recording loaded.
if (!process.exitCode) {
	const dist = path.join(desktop, "dist");
	const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
	const names = [...html.matchAll(/\.\/assets\/([^"]+)/g)].map((m) => m[1]);
	const listFile = path.join(out, "assets.json");
	const lists = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, "utf8")) : {};
	const all = new Set(fs.readdirSync(path.join(dist, "assets")));
	// (A file of an earlier build of the app is not one of this build's.)
	for (const name of sections) lists[name] = [...used].filter((f) => all.has(f)).sort();
	const wantedFiles = new Set([...names, ...Object.values(lists).flat().filter((f) => all.has(f))]);
	fs.rmSync(path.join(out, "assets"), { recursive: true, force: true });
	fs.mkdirSync(path.join(out, "assets"), { recursive: true });
	for (const f of wantedFiles) fs.copyFileSync(path.join(dist, "assets", f), path.join(out, "assets", f));
	write(listFile, JSON.stringify(lists, null, "\t"));
	write(path.join(out, "index.html"), html.replace(/<title>.*?<\/title>/, '<title>Pine</title>\n\t\t<meta name="robots" content="noindex" />').replace(/(\s*)<script type="module"/, '$1<script src="./reel.js"></script>$1<script type="module"'));
	console.log(`the app's page: ${wantedFiles.size} of ${all.size} files`);
}
await mock.close?.().catch(() => {});
proxy.close();
pages.close();
