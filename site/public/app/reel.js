// The Pine app's own page, played from a recording.
//
// This file is loaded into the app's page (app/index.html) before the app itself. It stands where the
// app's main process stands: it is `window.pine`, the bridge the page talks through, and answers every
// call with what the real daemon answered when the session was recorded (scripts/capture.mjs). The
// daemon's events come in as they came then, and what the owner did then (typed, clicked) is done again
// here, on the page's real controls. So everything that is drawn is drawn by the app.
//
//   app/index.html#story=hero            the story, from its start
//   app/index.html#story=code&at=diff    from one of its checkpoints
//
// A story is app/stories/<name>.json:
//   epoch            the time of day at its start
//   state            what the main process says of itself (pine:state)
//   tl               what happened, in order: [t, "send", channel, args] | [t, "act", {...}] | [t, "mark", {...}]
//   calls, pool      every answer of the daemon: calls["GET /agents"] = [[t, index into pool], ...]
//   tabs             the tabs the app had the daemon keep, over time
//   invoke           what the main process answered to the rest (the terminal, mostly)
//   media            pictures the daemon served, as files beside the story
//
// The page that shows it (site/src/main.ts) is told where the pointer is and which chapter plays, by
// postMessage, and steers with window.reel: play(), pause(), seek(name).
(() => {
	"use strict";
	const q = new URLSearchParams(location.hash.slice(1));
	const NAME = q.get("story") || "hero";
	const host = window.parent !== window ? window.parent : null;
	const post = (type, more) => host?.postMessage({ reel: NAME, type, ...more }, location.origin);
	const pnow = () => performance.now();
	const macro = (() => {
		const ch = new MessageChannel();
		const waiting = [];
		ch.port1.onmessage = () => waiting.shift()?.();
		return () => new Promise((r) => (waiting.push(r), ch.port2.postMessage(0)));
	})();
	const raw = (ms) => new Promise((r) => setTimeout(r, ms));

	// ---- the clock: the recording's time, which the page takes for the time of day -------------------

	const clock = {
		base: 0, t0: 0, limit: 0, running: false,
		now() { return this.running ? Math.min(this.limit, this.base + (pnow() - this.t0)) : this.base; },
		set(t) { this.base = t; this.t0 = pnow(); this.limit = Math.max(this.limit, t); },
		run(limit) { this.base = this.now(); this.t0 = pnow(); this.limit = Math.max(limit, this.base); this.running = true; },
		stop() { this.base = this.now(); this.running = false; },
	};
	let epoch = Date.now();
	const RealDate = Date;
	class ReelDate extends RealDate {
		constructor(...a) { if (a.length) super(...a); else super(epoch + clock.now()); }
		static now() { return Math.round(epoch + clock.now()); }
	}
	window.Date = ReelDate;

	// What the app keeps in the browser (which list is folded, how wide a panel is) is this window's alone.
	const kept = new Map();
	try {
		Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => void kept.set(k, String(v)), removeItem: (k) => void kept.delete(k), clear: () => kept.clear(), key: (i) => [...kept.keys()][i] ?? null, get length() { return kept.size; } } });
	} catch {}

	// The window is a picture on somebody's page: nothing that happens in it moves that page or takes its keys.
	// So nothing in it gets the focus (a frame that has it has the page's keys), and bringing something into view
	// scrolls what scrolls inside the window and nothing above it. Opened by itself, the page keeps its focus.
	const focus = HTMLElement.prototype.focus;
	HTMLElement.prototype.focus = function (options) { if (!host) focus.call(this, { ...options, preventScroll: true }); };
	/** Where an element is; one that has no box of its own (display: contents) is where what is in it is. */
	const boxOf = (el) => {
		if (el.getClientRects().length) return el.getBoundingClientRect();
		const range = document.createRange();
		range.selectNodeContents(el);
		return range.getClientRects().length ? range.getBoundingClientRect() : undefined;
	};
	Element.prototype.scrollIntoView = function (how) {
		const block = how === false ? "end" : (typeof how === "object" && how?.block) || "start";
		const behavior = typeof how === "object" ? how?.behavior : undefined;
		const margin = getComputedStyle(this);
		for (let box = this.parentElement; box; box = box.parentElement) {
			const style = getComputedStyle(box);
			if (box.scrollHeight <= box.clientHeight + 1 || !/auto|scroll|hidden/.test(style.overflowY)) continue;
			// (What is not drawn at all is nowhere: nothing scrolls for it, as in the browser's own.)
			const el = boxOf(this);
			if (!el) return;
			const top = box.getBoundingClientRect().top + box.clientTop + (parseFloat(style.scrollPaddingTop) || 0);
			const bottom = box.getBoundingClientRect().top + box.clientTop + box.clientHeight - (parseFloat(style.scrollPaddingBottom) || 0);
			const first = el.top - (parseFloat(margin.scrollMarginTop) || 0), last = el.bottom + (parseFloat(margin.scrollMarginBottom) || 0);
			const by = block === "start" ? first - top : block === "end" ? last - bottom : block === "center" ? (first + last) / 2 - (top + bottom) / 2 : first < top ? first - top : last > bottom ? last - bottom : 0;
			if (Math.abs(by) >= 1) box.scrollTo({ top: box.scrollTop + by, behavior });
		}
	};

	// A fault of the app's conversation view, kept from showing here. Opened on a conversation that has messages
	// already, the view takes the first of them for a new one as soon as a message comes in the place of the
	// "working" line (a command the owner ran is such a one), and goes to the very top. In the app that takes a
	// restart in the middle of a conversation; here a story is started in the middle whenever a chapter is
	// picked. So in a story that starts at a chapter, a jump of that view to its first line goes to its end.
	if (q.get("at")) {
		const scrollTo = Element.prototype.scrollTo;
		Element.prototype.scrollTo = function (...a) {
			const to = a[0];
			if (this.dataset?.slot === "message-scroller-viewport" && to && typeof to === "object" && to.top === 0 && this.scrollTop > 0) return scrollTo.call(this, { ...to, top: this.scrollHeight });
			return scrollTo.apply(this, a);
		};
	}

	// On a Mac the system draws the window's three buttons into the page's top left corner and tells the page how
	// much room they take (env(titlebar-area-x), which the app's `pl-window-buttons` reads). The site draws them
	// (site/src/style.css), and a browser has no such room to tell of, so it is said here.
	const ROOM = "padding-left: 78px !important";
	addEventListener("DOMContentLoaded", () => void document.head.append(Object.assign(document.createElement("style"), { textContent: `.pl-window-buttons { ${ROOM}; } @media (width < 40rem) { .max-sm\\:pl-window-buttons { ${ROOM}; } }` })));

	// ---- the story ------------------------------------------------------------------------------------

	let S;
	const story = fetch(`stories/${NAME}.json`).then((r) => r.json()).then((s) => {
		S = s;
		epoch = s.epoch;
		// The page asks its first questions as soon as it is told this: the time is that of where the story starts.
		const start = s.tl.find((e) => e[1] === "mark" && e[2].checkpoint === q.get("at")) ?? s.tl.find((e) => e[1] === "mark" && e[2].checkpoint);
		clock.set(start?.[0] ?? 0);
		return s;
	});
	const missed = new Set();
	/** Of a list in order of time, the entry whose time is nearest. */
	function nearest(list, t) {
		let lo = 0, hi = list.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid][0] < t) lo = mid + 1; else hi = mid; }
		if (lo > 0 && Math.abs(list[lo - 1][0] - t) <= Math.abs(list[lo][0] - t)) lo--;
		return list[lo][1];
	}
	/** The last entry at or before a time; the first, when there is none. */
	function last(list, t) {
		let found = list[0];
		for (const e of list) { if (e[0] > t) break; found = e; }
		return found?.[1];
	}
	function answer(method, url) {
		const t = clock.now();
		// The tabs the app has kept are those the recording's app had kept by now, whatever this one says.
		if (method === "POST" && url === "/ui/tabs") return { ok: true, status: 200, data: { ok: true } };
		if (method === "GET" && url === "/ui/tabs") return { ok: true, status: 200, data: structuredClone(last(S.tabs, t) ?? { tabs: [], active: 0, code: false }) };
		const list = S.calls[`${method} ${url}`];
		if (!list) {
			if (!missed.has(`${method} ${url}`)) (missed.add(`${method} ${url}`), console.warn("[reel] not in the recording:", method, url));
			return method === "POST" ? { ok: true, status: 200, data: {} } : { ok: false, status: 404, data: { error: "not found" } };
		}
		return structuredClone(S.pool[nearest(list, t)]);
	}
	const invoked = (channel, or) => { const list = S?.invoke?.[channel]; return list?.length ? structuredClone(nearest(list, clock.now())) : or; };

	// Pictures the daemon serves (pine-media:) are files beside the story.
	const NONE = "data:,";
	function pictureOf(url) {
		if (typeof url !== "string" || !url.startsWith("pine-media:")) return url;
		const key = url.replace(/^pine-media:\/\/[^/]*/, "").replace(/([?&])n=\d+&?/, "$1").replace(/[?&]$/, "");
		const m = S?.media?.[key];
		if (!m) return NONE;
		if (typeof m === "string") return m;
		const now = clock.now();
		let file;
		for (const [t, f] of m) if (t <= now) file = f;
		return file ?? NONE;
	}
	const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
	Object.defineProperty(HTMLImageElement.prototype, "src", { ...src, set(v) { src.set.call(this, pictureOf(v)); } });
	const setAttribute = Element.prototype.setAttribute;
	HTMLImageElement.prototype.setAttribute = function (name, value) { return setAttribute.call(this, name, name === "src" ? pictureOf(value) : value); };

	// ---- the bridge -----------------------------------------------------------------------------------

	const listeners = {};
	const on = (channel) => (fn) => ((listeners[channel] ??= new Set()).add(fn), () => void listeners[channel].delete(fn));
	const emit = (channel, ...args) => listeners[channel]?.forEach((fn) => { try { fn(...structuredClone(args)); } catch (e) { console.error("[reel]", channel, e); } });
	let inflight = 0;
	const asked = async (what) => {
		inflight++;
		try { await story; await macro(); return what(); } finally { inflight--; }
	};
	const nothing = () => asked(() => undefined);
	window.pine = {
		state: () => asked(() => ({ ...structuredClone(S.state), focused: true, connected: true, updates: false })),
		ready: () => void asked(() => (emit("pine:service", S.state.state), emit("pine:connection", true))),
		call: (method, url) => asked(() => answer(method, url)),
		retry: nothing, update: nothing, restart: nothing, use: nothing, open: nothing, reveal: nothing, notify: nothing, badge: nothing, contextMenu: nothing, voiceStop: nothing, saveText: nothing,
		init: () => asked(() => 1), browserInstall: () => asked(() => 1),
		prefs: (change) => asked(() => ({ ...S.state.prefs, ...change })),
		addHost: (h) => asked(() => ({ ...S.state.prefs })), forgetHost: () => asked(() => ({ ...S.state.prefs })),
		pickFolder: () => asked(() => invoked("pine:pick-folder")),
		command: () => asked(() => ({ state: "unavailable", text: "" })),
		voiceStart: () => Promise.reject(new Error("Dictation is in the Pine app only.")),
		pathOf: () => "",
		termOpen: () => asked(() => invoked("pine:term-open", { kept: "", cwd: "", fresh: true })),
		termRun: () => asked(() => invoked("pine:term-run", { reports: true })),
		termWrite: nothing, termResize: nothing, termClose: nothing,
		onTermData: on("pine:term-data"), onTermExit: on("pine:term-exit"), onTermRun: on("pine:term-run"),
		onService: on("pine:service"), onEvents: on("pine:events"), onConnection: on("pine:connection"),
		onMenu: on("pine:menu"), onFocus: on("pine:focus"), onInitLine: on("pine:init-line"), onVoice: on("pine:voice"),
	};

	// ---- the player -----------------------------------------------------------------------------------

	let gen = 0;
	let paused = true;
	let gates = [];
	const gate = () => (paused ? new Promise((r) => gates.push(r)) : undefined);
	class Stopped extends Error {}
	const alive = (mine) => { if (mine !== gen) throw new Stopped(); };
	/** Wait, in time that stands still while the reel is paused. */
	async function wait(ms, mine) {
		let left = ms;
		while (left > 0) {
			await gate();
			alive(mine);
			const from = pnow();
			await raw(Math.min(left, 60));
			left -= pnow() - from;
		}
		alive(mine);
	}
	/** Until the app has asked what it wanted to ask and has drawn it. */
	async function settled(mine, least = 60) {
		const from = pnow();
		for (let calm = 0; calm < 4 || pnow() - from < least; ) {
			await raw(12);
			if (mine !== undefined) alive(mine);
			calm = inflight ? 0 : calm + 1;
			if (pnow() - from > 4000) break;
		}
	}

	// The pointer: where it is, in the window's pixels. The page that shows the window draws it.
	let pointer;
	const say = (down = false) => {
		post("pointer", pointer ? { x: pointer.x, y: pointer.y, down } : { off: true });
		if (!host) own(pointer, down);
	};
	let ownEl;
	function own(p, down) {
		ownEl ??= document.body.appendChild(Object.assign(document.createElement("div"), { style: "position:fixed;left:0;top:0;z-index:99999;width:14px;height:14px;margin:-7px;border-radius:50%;background:#fff;mix-blend-mode:difference;pointer-events:none;transition:scale .1s" }));
		ownEl.style.display = p ? "" : "none";
		if (p) (ownEl.style.translate = `${p.x}px ${p.y}px`), (ownEl.style.scale = down ? "0.6" : "1");
	}
	// Where the conversation is in the window (it moves when a panel opens beside it): a page that shows a part of the window shows that part.
	if (host) {
		let was;
		setInterval(() => {
			const box = document.querySelector("[data-slot=composer]")?.getBoundingClientRect();
			const x = box?.width ? Math.round(box.left + box.width / 2) : undefined;
			if (x !== undefined && x !== was) post("view", { x: (was = x) });
		}, 400);
	}
	const W = () => window.innerWidth, H = () => window.innerHeight;
	const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
	/** Just off the window, beyond the edge that is nearest to a place in it. */
	const outside = (p) => {
		const d = [[p.y, { x: p.x + 60, y: -70 }], [W() - p.x, { x: W() + 80, y: p.y + 50 }], [H() - p.y, { x: p.x + 90, y: H() + 80 }]];
		return d.sort((a, b) => a[0] - b[0])[0][1];
	};
	/** The hand goes from where it is to a place, in a bow that leans away from the middle of the window. */
	async function glide(to, mine, leaving = false) {
		const from = pointer ?? outside(to);
		const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
		if (dist < 3) return void ((pointer = leaving ? undefined : to), say());
		const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
		// To the side of the way that is farther from the middle: near an edge the bow leaves the window for a moment.
		let nx = -dy / dist, ny = dx / dist;
		if ((mid.x - W() / 2) * nx + (mid.y - H() / 2) * ny < 0) (nx = -nx), (ny = -ny);
		const bow = Math.min(190, dist * 0.32);
		const c = { x: mid.x + nx * bow, y: mid.y + ny * bow };
		const ms = Math.max(420, Math.min(1150, 260 + dist * 1.05));
		const start = pnow();
		for (;;) {
			await gate();
			alive(mine);
			const t = Math.min(1, (pnow() - start) / ms), e = ease(t), u = 1 - e;
			pointer = { x: u * u * from.x + 2 * u * e * c.x + e * e * to.x, y: u * u * from.y + 2 * u * e * c.y + e * e * to.y };
			say();
			if (t >= 1) break;
			await new Promise((r) => requestAnimationFrame(r));
		}
		if (leaving) (pointer = undefined), say();
	}

	/** What an act is done to: the first thing on the page that fits and can be seen. (The capture finds it the same way.) */
	function find(spec) {
		const re = spec.text ? new RegExp(spec.text) : null;
		const list = [...document.querySelectorAll(spec.sel)].filter((el) => {
			// (The input that takes a file is not drawn: the app's button stands for it.)
			if (spec.do === "attach") return true;
			const r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && (!re || re.test((el.textContent ?? "").trim()));
		});
		return list[spec.last ? list.length - 1 : (spec.nth ?? 0)] ?? null;
	}
	async function found(spec, mine, ms = 6000) {
		const from = pnow();
		for (;;) {
			const el = find(spec);
			if (el) return el;
			if (pnow() - from > ms) return console.warn("[reel] nothing fits", JSON.stringify(spec)), null;
			await raw(40);
			alive(mine);
		}
	}
	const spot = (el) => {
		const r = el.getBoundingClientRect();
		return { x: r.left + Math.min(r.width / 2, 44), y: r.top + r.height / 2 };
	};
	/** What the keys go to: what was last clicked or typed into. (The frame cannot have the focus, so the page's own notion of it says nothing.) */
	let keyed;
	function press(el, at) {
		keyed = el;
		const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, button: 0, buttons: 1, detail: 1 };
		const p = { ...o, pointerId: 1, pointerType: "mouse", isPrimary: true, width: 1, height: 1, pressure: 0.5 };
		const under = document.elementFromPoint(at.x, at.y);
		const target = under && el.contains(under) ? under : el;
		target.dispatchEvent(new PointerEvent("pointerdown", p));
		target.dispatchEvent(new MouseEvent("mousedown", o));
		(target.closest("button, a, input, textarea, [tabindex]") ?? el).focus?.({ preventScroll: true });
		target.dispatchEvent(new PointerEvent("pointerup", { ...p, buttons: 0, pressure: 0 }));
		target.dispatchEvent(new MouseEvent("mouseup", { ...o, buttons: 0 }));
		target.dispatchEvent(new MouseEvent("click", { ...o, buttons: 0 }));
	}
	const setValue = (el, value) => {
		Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const key = (name) => {
		const el = keyed?.isConnected ? keyed : (document.activeElement ?? document.body);
		for (const type of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: name, code: name, bubbles: true, cancelable: true, composed: true }));
	};

	/** One thing the owner did, done again. `quick`: at once and without the hand (what sets a checkpoint up). */
	async function act(a, mine, quick = false) {
		if (a.do === "menu") return void emit("pine:menu", a.command);
		if (a.do === "key") return void key(a.key);
		if (a.do === "rest") return quick || !pointer ? undefined : glide(outside(pointer), mine, true);
		const el = await found(a, mine, quick ? 3000 : 6000);
		if (!el) return;
		el.scrollIntoView({ block: "nearest" });
		const show = !quick && !a.quiet;
		if (a.do === "click") {
			if (show) {
				await glide(spot(el), mine);
				await wait(140, mine);
				say(true);
				await wait(90, mine);
			}
			// It may have been drawn again while the hand was on its way.
			const now = (el.isConnected ? el : find(a)) ?? el;
			press(now, spot(now));
			if (show) (await wait(110, mine), say(false));
			return;
		}
		if (a.do === "type") {
			if (show && document.activeElement !== el) {
				await glide(spot(el), mine);
				await wait(120, mine);
				say(true);
				press(el, spot(el));
				await wait(100, mine);
				say(false);
			}
			el.focus();
			keyed = el;
			if (quick) return void setValue(el, a.value);
			for (let i = 1; i <= a.value.length; i++) {
				setValue(el, a.value.slice(0, i));
				const ch = a.value[i - 1];
				await wait(ch === " " ? 34 + Math.random() * 40 : /[.,:]/.test(ch) ? 90 + Math.random() * 60 : 16 + Math.random() * 30, mine);
			}
			return wait(260, mine);
		}
		if (a.do === "attach") {
			const data = new DataTransfer();
			data.items.add(new File([a.content ?? ""], a.name, { type: a.type ?? "text/plain" }));
			el.files = data.files;
			el.dispatchEvent(new Event("change", { bubbles: true }));
		}
	}

	const SKIP = new Set(["pine:menu", "pine:focus", "pine:service", "pine:connection"]);
	/** The longest that nothing happens: a wait of the recording that was longer is cut to this. */
	const LULL = 1100;
	const marks = () => S.tl.map((e, i) => ({ i, t: e[0], ...(e[1] === "mark" ? e[2] : {}) })).filter((m) => m.checkpoint);
	let playing;
	/** About how long the part that starts at an entry plays: to its end, or to the next checkpoint. */
	function lasts(from) {
		let ms = 0;
		for (let i = from + 1, t = S.tl[from][0]; i < S.tl.length; i++) {
			const [at, kind, a] = S.tl[i];
			ms += Math.min(Math.max(0, at - t), LULL);
			t = at;
			if (kind === "mark" && (a.checkpoint || a.end || a.feed)) break;
			if (kind === "mark" && a.hold) ms += a.hold;
			if (kind === "act") ms += a.quiet ? 0 : a.do === "type" ? 1100 + a.value.length * 36 : a.do === "click" ? 1150 : a.do === "rest" ? 600 : 0;
		}
		return ms;
	}
	/** A log that does not end: what the sources reported in the recording comes again and again, at the time it is now. */
	async function feed(mine) {
		clock.run(Infinity);
		let id = 1_000_000;
		for (let n = 0; ; n++) {
			const e = S.feed[n % S.feed.length];
			// Something happens in the world now and then; what the agents do about it follows quickly.
			await wait(e.topic.startsWith("source/") ? 350 + Math.random() * 1500 : 60 + Math.random() * 260, mine);
			emit("pine:events", [{ ...e, id: id++, ts: Date.now() }]);
		}
	}

	/** Play from an entry of the timeline to the story's end, or to where a part of it ends. */
	async function run(from, mine) {
		clock.set(S.tl[from]?.[0] ?? 0);
		for (let i = from; i < S.tl.length; i++) {
			const [t, kind, a, args] = S.tl[i];
			const gap = t - clock.now();
			if (gap > 0) {
				clock.run(t);
				await wait(Math.min(gap, LULL), mine);
				clock.stop();
			}
			clock.set(t);
			if (kind === "send") { if (!SKIP.has(a)) emit(a, ...args); }
			else if (kind === "act") {
				// The hand does not leave the window when it is needed again in a moment.
				const soon = a.do === "rest" && S.tl.slice(i + 1).find((e) => e[1] === "act" && (e[2].do === "click" || e[2].do === "type") && !e[2].quiet);
				if (!(soon && soon[0] - t < 2600)) await act(a, mine);
			}
			else if (kind === "mark") {
				if (a.checkpoint && i !== from) post("chapter", { name: (playing = a.checkpoint), ms: lasts(i) });
				if (a.feed && S.feed?.length) return feed(mine);
				if (a.hold) (clock.run(S.tl[i + 1]?.[0] ?? t), await wait(a.hold, mine), clock.stop());
				if (a.end) return post("end", { name: playing });
			}
			await gate();
			alive(mine);
		}
		post("end", { name: playing });
	}
	const going = (p) => p.catch((e) => { if (!(e instanceof Stopped)) console.error("[reel]", e); });

	/** Start at a checkpoint. The app is either just loaded (it asked the daemon at that time) or is told its pine started again. */
	async function begin(name, again) {
		const mine = ++gen;
		await story;
		const all = marks();
		const m = all.find((x) => x.checkpoint === name) ?? all[0];
		if (!m) return console.warn("[reel] the story has no checkpoint");
		playing = m.checkpoint;
		clock.stop();
		clock.set(m.t);
		pointer = undefined;
		say();
		if (again) {
			// What the app is still asking for (it may be in the middle of the last start) is answered first.
			await settled(mine, 0);
			clock.set(m.t);
			// A dialog or a menu that was open is put away, and the app asks for everything anew.
			key("Escape");
			emit("pine:service", { status: "starting" });
			emit("pine:service", S.state.state);
		}
		await settled(mine, again ? 30 : 250);
		for (const a of m.setup ?? []) (await act(a, mine, true), await settled(mine, 30));
		post("ready", { name: m.checkpoint });
		post("chapter", { name: m.checkpoint, ms: lasts(m.i) });
		await gate();
		alive(mine);
		await run(m.i + 1, mine);
	}

	window.reel = {
		name: NAME,
		get story() { return S; },
		play() { paused = false; gates.splice(0).forEach((r) => r()); },
		pause() { paused = true; },
		/** Go to a checkpoint without loading the page again. */
		seek(name) { return going(begin(name, true)); },
		clock,
		missed,
	};
	if (!host || q.get("play")) window.reel.play();
	// The app boots by itself once this script has run; the story starts when it has drawn what it asked for.
	addEventListener("DOMContentLoaded", () => void going(begin(q.get("at") || undefined, false)));
})();
