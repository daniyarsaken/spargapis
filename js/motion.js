/* =================================================================
   MOTION — Lenis smooth scroll + GSAP ScrollTrigger choreography
   Loads only when GSAP + ScrollTrigger are present (html.has-gsap).
   On reduced-motion or missing libs it reveals everything statically.
   ================================================================= */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!window.gsap || !window.ScrollTrigger || reduce) {
    if (window.__revealAll) window.__revealAll();
    return;
  }

  try {
    gsap.registerPlugin(ScrollTrigger);

    /* ---------- Smooth scroll (Lenis) ---------- */
    let lenis = null;
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);

      // route in-page anchors through Lenis
      $$('a[href^="#"]').forEach((a) => {
        const id = a.getAttribute('href');
        if (id.length > 1) {
          a.addEventListener('click', (e) => {
            const target = document.querySelector(id);
            if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -10, duration: 1.2 }); }
          });
        }
      });
    }

    /* ---------- Scroll progress bar ---------- */
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    gsap.to(bar, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
    });

    /* ---------- Hero: orchestrated intro ---------- */
    const heroBg = $('#heroBg');
    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro
      .to('#preloader', { autoAlpha: 0, duration: 0.7 }, 0.3)
      .fromTo(heroBg, { scale: 1.28, autoAlpha: 0 }, { scale: 1.06, autoAlpha: 1, duration: 2.4, ease: 'power2.out' }, 0)
      .fromTo('.hero .ornament-divider', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9 }, 0.6)
      .fromTo('.hero h1', { yPercent: 22, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.2 }, 0.7)
      .fromTo('.hero .tagline', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.0 }, '-=0.7')
      .fromTo('.hero .hero-cta', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9 }, '-=0.6')
      .fromTo('.hero__scroll', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, '-=0.4');

    // mark hero ready (for any CSS that keys off it) without re-triggering CSS entrance
    $('#hero') && $('#hero').classList.add('ready');

    /* ---------- Hero: parallax on scroll ---------- */
    gsap.to(heroBg, {
      yPercent: 22, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__inner', {
      yPercent: 34, autoAlpha: 0, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__pattern', {
      yPercent: 12, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    /* ---------- Generic reveal (stagger in) ---------- */
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 88%',
      onEnter: (els) => {
        els.forEach((e) => e.classList.add('in')); // keeps ornament line-draw + paper rules
        gsap.fromTo(els,
          { autoAlpha: 0, y: 46 },
          { autoAlpha: 1, y: 0, duration: 1.0, ease: 'power3.out', stagger: 0.09, overwrite: true });
      },
    });

    /* ---------- Section headings: line-mask rise ---------- */
    $$('.sec-head h2, .final h2, .infobox-intro h2').forEach((h) => {
      gsap.fromTo(h,
        { autoAlpha: 0, y: 40, clipPath: 'inset(0 0 100% 0)' },
        {
          autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'power4.out',
          scrollTrigger: { trigger: h, start: 'top 86%' },
        });
    });

    /* ---------- Ken Burns inside image cards ---------- */
    $$('.card__img:not(.placeholder), .food__img:not(.placeholder)').forEach((img) => {
      const host = img.closest('.card, .food');
      gsap.fromTo(img, { scale: 1.18 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: host, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    /* ---------- "Qazaq" big word drift ---------- */
    const bigWord = $('.name-meaning .big-word');
    if (bigWord) {
      gsap.fromTo(bigWord, { yPercent: 18, autoAlpha: 0.35 }, {
        yPercent: -14, autoAlpha: 1, ease: 'none',
        scrollTrigger: { trigger: '#about', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }

    /* ---------- Country stats count-up ---------- */
    $$('.stat .num').forEach((numEl) => {
      const textNode = Array.from(numEl.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!textNode) return;
      const raw = textNode.textContent.trim();
      if (!/^\d+$/.test(raw)) return;
      const target = +raw;
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: numEl, start: 'top 85%', once: true,
        onEnter: () => gsap.to(obj, {
          v: target, duration: 1.8, ease: 'power2.out',
          onUpdate: () => { textNode.textContent = Math.round(obj.v); },
        }),
      });
    });

    /* ---------- Timeline progress line ---------- */
    const timeline = $('#timeline');
    if (timeline) {
      const line = document.createElement('span');
      Object.assign(line.style, {
        position: 'absolute', left: '0', top: '6px', width: '1px', transformOrigin: 'top',
        background: 'var(--accent)', transform: 'scaleY(0)', zIndex: '1',
      });
      line.style.height = 'calc(100% - 12px)';
      timeline.style.position = 'relative';
      timeline.appendChild(line);
      gsap.to(line, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: timeline, start: 'top 70%', end: 'bottom 80%', scrub: true },
      });
    }

    /* ---------- Final: cinematic scale-in ---------- */
    gsap.fromTo('.final h2',
      { scale: 1.22, autoAlpha: 0.15, letterSpacing: '0.05em' },
      {
        scale: 1, autoAlpha: 1, letterSpacing: '-0.03em', ease: 'none',
        scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'center center', scrub: true },
      });
    gsap.fromTo('.final__pattern', { scale: 1.3 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    /* ---------- Alternating section "lift" for paper/night bands ---------- */
    $$('.section').forEach((sec) => {
      const wrap = sec.querySelector('.wrap');
      if (!wrap || sec.classList.contains('final')) return;
      gsap.fromTo(wrap, { y: 30 }, {
        y: 0, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 60%', scrub: true },
      });
    });

    /* ---------- Full-bleed section backgrounds: scroll parallax ---------- */
    $$('.section-bg').forEach((bg) => {
      const pan = bg.querySelector('.section-bg__pan');
      const sec = bg.closest('.section');
      if (!pan || !sec) return;
      gsap.fromTo(pan, { yPercent: -9 }, {
        yPercent: 9, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // recalc once everything (fonts, injected cards) settled
    window.addEventListener('load', () => ScrollTrigger.refresh());
    setTimeout(() => ScrollTrigger.refresh(), 600);

  } catch (err) {
    console.error('[motion] init failed, falling back:', err);
    if (window.__revealAll) window.__revealAll();
  }
})();
