// The view's frame keeps the time of the recording, as the app's page around it does (reel.js gives that
// page the recording's clock). The view says how long ago something started by its own Date: without this
// it would measure the recording's times against today's.
//
// The page tells the frame what time it is there, a few times a second, and the frame's Date is that time
// from then on. Nothing else is said, and the frame answers nothing: the view itself is the app's own.
(() => {
	const RealDate = Date;
	let offset = 0;
	class ReelDate extends RealDate {
		constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
		static now() { return Math.round(RealDate.now() + offset); }
	}
	window.Date = ReelDate;
	addEventListener("message", (e) => {
		if (e.source === window.parent && typeof e.data?.reelNow === "number") offset = e.data.reelNow - RealDate.now();
	});
})();
