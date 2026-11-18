// The shots of the app are the Pine app's own DOM (scripts/capture.mjs), drawn at the window's size and
// scaled to the width of their place in the grid. A shot with several scenes is a show: its first scene is
// in the page, the others are fetched when it comes near the screen, and they follow one another while it
// is on screen. Everything else on the page is CSS.

const SHOW_MS = 5200;
const still = matchMedia("(prefers-reduced-motion: reduce)");

const shots = document.querySelectorAll<HTMLElement>("[data-scale]");
const fit = (shot: HTMLElement) => {
	const w = Number(getComputedStyle(shot).getPropertyValue("--wv")) || 1280;
	shot.style.setProperty("--s", String(shot.clientWidth / w));
};
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

for (const shot of document.querySelectorAll<HTMLElement>("[data-show-of]")) {
	const names = (shot.dataset.showOf ?? "").split(/\s+/).filter(Boolean);
	// What says which scene is on: the list beside it, a caption, a row of the sources.
	const marks = [...document.querySelectorAll<HTMLElement>("[data-show]")].filter((m) => names.includes(m.dataset.show ?? ""));
	const list = marks.find((m) => m.closest(".show-list"))?.closest<HTMLElement>(".show-list");
	list?.style.setProperty("--show-ms", `${SHOW_MS}ms`);
	if (still.matches) list?.classList.add("still");
	let at = 0;
	let timer = 0;
	let seen = false;
	let fetched: Promise<void> | undefined;

	const scene = (name: string) => shot.querySelector<HTMLElement>(`.scene[data-scene="${name}"]`);
	const load = () =>
		(fetched ??= Promise.all(
			names.map(async (name) => {
				if (scene(name)) return;
				// (Cloudflare Pages serves a page without its .html and redirects to there; Vite only with it.)
				const html = await fetch(import.meta.env.DEV ? `/shots/${name}.html` : `/shots/${name}`).then((r) => (r.ok ? r.text() : ""), () => "");
				if (!html) return;
				const el = document.createElement("div");
				el.className = "scene";
				el.dataset.scene = name;
				el.innerHTML = html;
				shot.append(el);
				settle(el);
			}),
		).then(() => {
			// The scenes in their order, whichever came first.
			for (const name of names) { const el = scene(name); if (el) shot.append(el); }
		}));

	const show = (i: number) => {
		at = (i + names.length) % names.length;
		const name = names[at];
		if (!scene(name)) return;
		shot.querySelectorAll<HTMLElement>(".scene").forEach((el) => el.classList.toggle("on", el.dataset.scene === name));
		for (const m of marks) {
			const on = m.dataset.show === name;
			m.classList.toggle("on", on);
			// The bar under a list's item runs again from the start.
			if (on && m.closest(".show-list")) { m.style.animation = "none"; void m.offsetWidth; m.style.animation = ""; }
		}
	};
	const run = () => {
		clearInterval(timer);
		if (still.matches || !seen) return;
		timer = window.setInterval(() => show(at + 1), SHOW_MS);
	};
	for (const m of marks) {
		m.addEventListener("click", () => {
			const i = names.indexOf(m.dataset.show ?? "");
			void load().then(() => { show(i); run(); });
		});
	}
	new IntersectionObserver(([e]) => { if (e.isIntersecting) void load(); }, { rootMargin: "100% 0px" }).observe(shot);
	new IntersectionObserver(([e]) => {
		seen = e.isIntersecting;
		list?.classList.toggle("paused", !seen);
		if (seen) void load().then(() => { show(at); run(); });
		else clearInterval(timer);
	}, { threshold: 0.35 }).observe(shot);
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
