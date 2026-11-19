// The shots of the app are the Pine app's own DOM (scripts/capture.mjs), drawn at the window's size and
// scaled to the width of their place in the grid. A shot with several scenes is a show: its first scene is
// in the page, the others are fetched one by one as they are needed, and they follow one another while it
// is on screen. Where the owner clicked to reach a scene is kept with it, and a pointer goes there.
// Everything else on the page is CSS.

const SHOW_MS = 5200;
/** How long the pointer takes from one place to the next, before the scene it leads to comes. */
const MOVE_MS = 1300;
const still = matchMedia("(prefers-reduced-motion: reduce)");

const shots = document.querySelectorAll<HTMLElement>("[data-scale]");
const num = (el: Element, name: string, or = 0) => Number(getComputedStyle(el).getPropertyValue(name)) || or;
const fit = (shot: HTMLElement) => shot.style.setProperty("--s", String(shot.clientWidth / num(shot, "--wv", 1280)));
const watch = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target as HTMLElement)));
shots.forEach((shot) => { fit(shot); watch.observe(shot); });

/** A scene stands where it was taken: its scroll positions are attributes, set again once it is in the page. */
function settle(scene: HTMLElement) {
	requestAnimationFrame(() => {
		for (const el of scene.querySelectorAll<HTMLElement>("[data-scroll]")) {
			const [x, y] = (el.dataset.scroll ?? "0,0").split(",").map(Number);
			el.scrollLeft = x;
			el.scrollTop = y;
		}
	});
}
document.querySelectorAll<HTMLElement>(".scene").forEach(settle);

// ---- the pointer ------------------------------------------------------------------------------------

type Point = { x: number; y: number };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The owner's hand on a show: it goes where the next scene was clicked, by a curve that leaves the window
 * a little and comes back, and clicks. Positions are the window's pixels; the pointer itself keeps its size.
 */
function pointer(shot: HTMLElement) {
	const el = document.createElement("i");
	el.className = "pointer";
	el.setAttribute("aria-hidden", "true");
	el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.8 6.6 3-1.3-2.8-6.5H18L5 2.5Z"/></svg><b></b>';
	shot.append(el);
	let at: Point | undefined;
	let frame = 0;
	const place = (p: Point, out = 0) => {
		const s = num(shot, "--s", 1);
		el.style.transform = `translate(${(p.x - num(shot, "--xv")) * s}px, ${(p.y - num(shot, "--yv")) * s}px)`;
		el.style.opacity = String(1 - out);
	};
	/** Off the window, beyond its nearest edge: where the hand rests while nobody is at it. */
	const away = (from: Point): Point => {
		const w = num(shot, "--wv", 1280), h = num(shot, "--ch", num(shot, "--h", 800)), x0 = num(shot, "--xv"), y0 = num(shot, "--yv");
		return from.y - y0 < h / 2 ? { x: from.x, y: y0 - 90 } : { x: x0 + w + 90, y: from.y };
	};
	return {
		go(to: Point | undefined, ms = MOVE_MS, click = true) {
			cancelAnimationFrame(frame);
			if (!to && !at) return;
			const a = at ?? away(to!);
			const b = to ?? away(a);
			const leaving = !to;
			el.classList.add("on");
			// The curve leaves the window on the far side of each end, as far as the way is long.
			const w = num(shot, "--wv", 1280), h = num(shot, "--ch", num(shot, "--h", 800));
			const c = { x: num(shot, "--xv") + w / 2, y: num(shot, "--yv") + h / 2 };
			const out = (p: Point, k: number): Point => {
				const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
				return { x: p.x + (dx / d) * k, y: p.y + (dy / d) * k };
			};
			const k = Math.min(340, 150 + Math.hypot(b.x - a.x, b.y - a.y) * 0.5);
			const p1 = out(a, k), p2 = out(b, k);
			const start = performance.now();
			const step = (now: number) => {
				const t = Math.min(1, (now - start) / ms), e = ease(t), u = 1 - e;
				const p = { x: u * u * u * a.x + 3 * u * u * e * p1.x + 3 * u * e * e * p2.x + e * e * e * b.x, y: u * u * u * a.y + 3 * u * u * e * p1.y + 3 * u * e * e * p2.y + e * e * e * b.y };
				place(p, leaving ? e : 0);
				if (t < 1) frame = requestAnimationFrame(step);
				else if (click && !leaving) { el.classList.remove("click"); void el.offsetWidth; el.classList.add("click"); }
			};
			frame = requestAnimationFrame(step);
			at = leaving ? undefined : b;
		},
		jump(to: Point | undefined) {
			cancelAnimationFrame(frame);
			at = to;
			if (to) place(to);
			el.style.opacity = to ? "1" : "0";
			el.classList.toggle("on", Boolean(to));
		},
		refit() { if (at) place(at); },
	};
}

// ---- shows ------------------------------------------------------------------------------------------

for (const shot of document.querySelectorAll<HTMLElement>("[data-show-of]")) {
	const names = (shot.dataset.showOf ?? "").split(/\s+/).filter(Boolean);
	// What says which scene is on: the list beside it, a caption, a row of the sources.
	const marks = [...document.querySelectorAll<HTMLElement>("[data-show]")].filter((m) => names.includes(m.dataset.show ?? ""));
	const list = marks.find((m) => m.closest(".show-list"))?.closest<HTMLElement>(".show-list");
	list?.style.setProperty("--show-ms", `${SHOW_MS}ms`);
	if (still.matches) list?.classList.add("still");
	const hand = shot.hasAttribute("data-pointer") && !still.matches ? pointer(shot) : undefined;
	if (hand) new ResizeObserver(() => hand.refit()).observe(shot);
	let at = 0;
	let seen = false;
	let held = false;
	const timers: number[] = [];
	const loading = new Map<string, Promise<HTMLElement | undefined>>();

	const scene = (name: string) => shot.querySelector<HTMLElement>(`.scene[data-scene="${name}"]`);
	const ensure = (name: string) => {
		const there = scene(name);
		if (there) return Promise.resolve(there);
		if (!loading.has(name))
			loading.set(name, (async () => {
				// (Cloudflare Pages serves a page without its .html and redirects to there; Vite only with it.)
				const html = await fetch(import.meta.env.DEV ? `/shots/${name}.html` : `/shots/${name}`).then((r) => (r.ok ? r.text() : ""), () => "");
				if (!html) return undefined;
				const el = document.createElement("div");
				el.className = "scene";
				el.dataset.scene = name;
				el.innerHTML = html;
				// In their order, whichever came first: a later scene lies above an earlier one while they cross.
				const after = names.slice(names.indexOf(name) + 1).map(scene).find(Boolean);
				shot.insertBefore(el, after ?? shot.querySelector(".pointer"));
				settle(el);
				return el;
			})());
		return loading.get(name)!;
	};
	/** Where the owner clicked to reach a scene, if they did. */
	const target = async (i: number) => {
		const el = await ensure(names[(i + names.length) % names.length]);
		const at = el?.querySelector<HTMLElement>(".pine-shot")?.dataset.cursor;
		if (!at) return undefined;
		const [x, y] = at.split(",").map(Number);
		return { x, y };
	};

	const show = async (i: number) => {
		const next = (i + names.length) % names.length;
		const el = await ensure(names[next]);
		if (!el) return;
		at = next;
		const name = names[at];
		shot.querySelectorAll<HTMLElement>(".scene").forEach((s) => s.classList.toggle("on", s.dataset.scene === name));
		for (const m of marks) {
			const on = m.dataset.show === name;
			m.classList.toggle("on", on);
			// The bar under a list's item runs again from the start.
			if (on && m.closest(".show-list")) { m.style.animation = "none"; void m.offsetWidth; m.style.animation = ""; }
		}
		void ensure(names[(at + 1) % names.length]);
	};
	const stop = () => { timers.forEach(clearTimeout); timers.length = 0; };
	/** The show goes on from the scene that is on: the hand moves to the next one's place, then it comes. */
	const run = () => {
		stop();
		if (still.matches || !seen || held) return;
		timers.push(window.setTimeout(async () => hand?.go(await target(at + 1)), SHOW_MS - MOVE_MS - 150));
		timers.push(window.setTimeout(async () => { await show(at + 1); run(); }, SHOW_MS));
	};
	const jump = async (i: number) => {
		stop();
		await show(i);
		hand?.go(await target(i), 600, false);
		run();
	};
	for (const m of marks) {
		const i = names.indexOf(m.dataset.show ?? "");
		m.addEventListener("click", () => void jump(i));
		// A list of the sources: the one under the pointer is shown, and the show waits while it is there.
		if (m.closest("[data-hover]")) m.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { held = true; void jump(i); } });
	}
	shot.closest("section")?.querySelector("[data-hover]")?.addEventListener("pointerleave", () => { held = false; run(); });
	new IntersectionObserver(([e]) => { if (e.isIntersecting) { void ensure(names[at]); void ensure(names[(at + 1) % names.length]); } }, { rootMargin: "100% 0px" }).observe(shot);
	new IntersectionObserver(([e]) => {
		seen = e.isIntersecting;
		list?.classList.toggle("paused", !seen);
		if (seen) void show(at).then(async () => { hand?.jump(await target(at)); run(); });
		else stop();
	}, { threshold: 0.35 }).observe(shot);
}

// ---- the event log, live ------------------------------------------------------------------------------

/**
 * The log of the app, as it was taken, keeps going as a log does: an event comes in at the bottom with the
 * next time, the others move up, and the oldest goes out at the top. The rows are the log's own; they come
 * round again.
 */
for (const shot of document.querySelectorAll<HTMLElement>("[data-live-log]")) {
	const rows = shot.querySelector<HTMLElement>("[data-slot=message-scroller-content]");
	if (!rows || still.matches) continue;
	let scroller: HTMLElement | null = rows;
	while (scroller && scroller !== shot && !(scroller.scrollHeight > scroller.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
	const box = scroller && scroller !== shot ? scroller : undefined;
	const bottom = (smooth: boolean) => box?.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "instant" });
	requestAnimationFrame(() => bottom(false));
	// The clock goes on from the last time in the log.
	const [h, m, s] = ((rows.lastElementChild?.querySelector("span")?.textContent ?? "").match(/\d+/g) ?? ["9", "0", "0"]).map(Number);
	const clock = new Date(2026, 10, 19, h, m, s);
	const stamp = () => { clock.setSeconds(clock.getSeconds() + 1 + Math.floor(Math.random() * 3)); return clock.toLocaleTimeString("sv-SE"); };
	let timer = 0;
	const tick = () => {
		const first = rows.firstElementChild as HTMLElement | null;
		if (!first) return;
		const time = first.querySelector<HTMLElement>("span");
		if (time) time.textContent = stamp();
		first.classList.remove("arrive");
		rows.append(first);
		void first.offsetWidth;
		first.classList.add("arrive");
		bottom(true);
	};
	new IntersectionObserver(([e]) => {
		clearInterval(timer);
		if (e.isIntersecting) timer = window.setInterval(tick, 1100);
	}).observe(shot);
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
	button.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(button.dataset.copy ?? "");
			button.textContent = "Copied";
		} catch {
			button.textContent = "Select it";
		}
		setTimeout(() => (button.textContent = "Copy"), 1600);
	});
}
