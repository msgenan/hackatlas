/* The page's one orchestrated moment: headline lines rise, the board settles, passes reveal as they enter.
   Content is fully visible without JS; states are only hidden here, right before they animate. */
import { reducedMotion } from "./today";

type Gsap = {
  set: (t: unknown, v: object) => void;
  to: (t: unknown, v: object) => unknown;
  fromTo: (t: unknown, a: object, b: object) => unknown;
};
let gsap: Gsap | undefined;
/** GSAP is a pinned classic script (public/vendor); wait for it, give up quietly if it never comes. */
export function ready(): Promise<boolean> {
  const get = () => (gsap = (window as unknown as { gsap?: Gsap }).gsap);
  if (get()) return Promise.resolve(true);
  return new Promise((res) => addEventListener("load", () => res(!!get()), { once: true }));
}

export function heroIntro(): void {
  const g = gsap;
  if (!g || reducedMotion()) return;
  const lines = document.querySelectorAll(".hero-title .line > span");
  const sub = document.querySelector(".hero-sub");
  const board = document.querySelector(".board");
  g.fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.09 });
  if (sub) g.fromTo(sub, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out", delay: 0.25 });
  if (board) g.fromTo(board, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out", delay: 0.15 });
}

/** Passes rise in once, in small batches, as they scroll into view. */
export function revealPasses(): void {
  const g = gsap;
  if (!g || reducedMotion() || !("IntersectionObserver" in window)) return;
  const pending = new Set<Element>();
  let timer = 0;
  const flush = () => {
    const batch = [...pending].slice(0, 6);
    batch.forEach((el) => pending.delete(el));
    g.fromTo(batch, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.05, clearProps: "transform,opacity,visibility" });
    timer = pending.size ? window.setTimeout(flush, 60) : 0;
  };
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      pending.add(en.target);
    }
    if (pending.size && !timer) timer = window.setTimeout(flush, 0);
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".pass").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight) return; // already on screen: leave it alone
    g.set(el, { autoAlpha: 0 });
    io.observe(el);
  });
}
