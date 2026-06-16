/* =================================================================
   APP — Kazakstan digital museum
   ================================================================= */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Ornament background pattern (tiled SVG) ---------- */
  const patternSVG = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <g fill="none" stroke="#C39A4A" stroke-width="1.1" stroke-linecap="round">
        <path d="M90 70 C70 70 62 50 42 54 C30 56 30 74 48 74 C58 74 58 64 50 64"/>
        <path d="M90 70 C110 70 118 50 138 54 C150 56 150 74 132 74 C122 74 122 64 130 64"/>
        <path d="M90 110 C70 110 62 130 42 126 C30 124 30 106 48 106 C58 106 58 116 50 116"/>
        <path d="M90 110 C110 110 118 130 138 126 C150 124 150 106 132 106 C122 106 122 116 130 116"/>
        <circle cx="90" cy="90" r="6"/><path d="M90 76v28"/>
      </g>
    </svg>`
  );
  const patternURL = `url("data:image/svg+xml,${patternSVG}")`;
  ['heroPattern', 'finalPattern'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.backgroundImage = patternURL;
  });

  /* ---------- Corner ornament SVG markup ---------- */
  const corner = (cls) =>
    `<svg class="card__corner ${cls}" viewBox="0 0 24 24"><use href="#orn-corner"/></svg>`;

  /* ---------- Render image/slot cards ---------- */
  function bgStyle(item) {
    if (item.img) return `style="background-image:url('${item.img}')"`;
    return ''; // placeholder gradient handled by class
  }
  function cardHTML(item, i) {
    const colClass = item.span === 8 ? 'col-8' : item.span === 6 ? 'col-6' : 'col-4';
    const imgClass = item.img ? 'card__img' : 'card__img placeholder';
    const slot = item.slot ? ' data-slot="photo"' : '';
    return `
      <article class="card ${colClass} ${item.tall ? 'tall' : ''}" data-reveal data-reveal-delay="${i % 3}" data-card='${i}'>
        <div class="${imgClass}"${slot} ${bgStyle(item)}></div>
        ${corner('')}${corner('tr')}
        <button class="card__plus" aria-label="Открыть статью">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <div class="card__body">
          <span class="card__cat">${item.cat}</span>
          <h3 class="card__title">${item.title}</h3>
          <p class="card__sub">${item.sub}</p>
        </div>
      </article>`;
  }

  function renderCards(targetId, list) {
    const grid = document.getElementById(targetId);
    if (!grid) return;
    grid.innerHTML = list.map(cardHTML).join('');
    $$('.card', grid).forEach((card) => {
      const item = list[+card.dataset.card];
      card.addEventListener('click', () => openModal(item));
    });
  }
  renderCards('natureGrid', DATA.nature);
  renderCards('cultureGrid', DATA.culture);
  renderCards('citiesGrid', DATA.cities);

  /* ---------- Symbols & games (motif cards) ---------- */
  function motifHTML(item, i) {
    return `
      <div class="symbol" data-reveal data-reveal-delay="${i % 3}">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${item.ico}</svg>
        <h4>${item.title}</h4>
        <p>${item.sub}</p>
      </div>`;
  }
  const sg = $('#symbolGrid'); if (sg) sg.innerHTML = DATA.symbols.map(motifHTML).join('');
  const gg = $('#gamesGrid'); if (gg) gg.innerHTML = DATA.games.map(motifHTML).join('');

  /* ---------- Timeline ---------- */
  const tl = $('#timeline');
  if (tl) tl.innerHTML = DATA.timeline.map((t, i) => `
    <div class="tl-item" data-reveal data-reveal-delay="${i % 3}">
      <span class="dot"></span>
      <div class="yr">${t.yr}</div>
      <h4>${t.title}</h4>
      <p>${t.text}</p>
    </div>`).join('');

  /* ---------- Food ---------- */
  const fg = $('#foodGrid');
  if (fg) fg.innerHTML = DATA.food.map((f, i) => `
    <div class="food ${f.cls}" data-reveal data-reveal-delay="${i % 4}">
      <div class="food__img placeholder" data-slot="photo"></div>
      <div class="food__body"><h4>${f.title}</h4><p>${f.sub}</p></div>
    </div>`).join('');

  /* ---------- Kuy list ---------- */
  const kl = $('#kuyList');
  if (kl) kl.innerHTML = DATA.kuy.map((k) => `
    <div class="kuy">
      <button class="play" aria-label="Слушать ${k.title}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <div class="meta"><h4>${k.title}</h4><p>${k.author}</p></div>
      <span class="dur">${k.dur}</span>
    </div>`).join('');

  /* ---------- Instagram grid ---------- */
  const ig = $('#igGrid');
  if (ig) {
    const igImgs = [IMG.charyn, IMG.kolsai, IMG.mangistau, IMG.night];
    let cells = '';
    for (let i = 0; i < 8; i++) {
      const src = igImgs[i % igImgs.length];
      const showImg = i < 4; // first row real, rest styled slots
      cells += `
        <a class="ig-cell" href="https://instagram.com" target="_blank" rel="noopener" data-reveal data-reveal-delay="${i % 4}">
          ${showImg ? `<img src="${src}" alt="Казахстан" loading="lazy">` : `<span class="ph" data-slot="photo"></span>`}
          <svg class="ig-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
        </a>`;
    }
    ig.innerHTML = cells;
  }

  /* ---------- Scroll reveal ---------- */
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    $$('[data-reveal]').forEach((el) => io.observe(el));
  } else {
    $$('[data-reveal]').forEach((el) => el.classList.add('in'));
  }

  /* ---------- Preloader + hero entrance ---------- */
  const preloader = $('#preloader');
  const hero = $('#hero');
  function launch() {
    if (preloader) preloader.classList.add('done');
    if (hero) hero.classList.add('ready');
  }
  window.addEventListener('load', () => setTimeout(launch, reduce ? 0 : 1500));
  // safety: never trap behind a slow asset
  setTimeout(launch, 3200);

  /* ---------- Header scroll state ---------- */
  const header = $('#header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Parallax hero ---------- */
  const heroBg = $('#heroBg');
  if (heroBg && !reduce) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y < window.innerHeight) {
        heroBg.style.transform = `translate3d(0, ${y * 0.28}px, 0) scale(1.05)`;
        const inner = $('.hero__inner');
        if (inner) { inner.style.transform = `translateY(${y * 0.14}px)`; inner.style.opacity = String(1 - y / (window.innerHeight * 0.9)); }
      }
    }, { passive: true });
  }

  /* ---------- Day-mode switch ---------- */
  $$('[data-set-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.setMode;
      document.body.setAttribute('data-mode', mode);
      $$('[data-set-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  /* ---------- Sound toggle (UI only) ---------- */
  const soundBtn = $('#soundBtn');
  if (soundBtn) soundBtn.addEventListener('click', () => {
    const on = soundBtn.classList.toggle('playing');
    soundBtn.setAttribute('aria-pressed', String(on));
    // Real ambient audio (wind + dombra kuy) is wired in code; UI state only here.
  });

  /* ---------- Name morph ---------- */
  const morphWord = $('#morphWord');
  const morphSwitch = $('#morphSwitch');
  let morphTimer;
  function setMorph(word) {
    if (!morphWord) return;
    morphWord.style.transition = 'opacity .3s ease';
    morphWord.style.opacity = '0';
    setTimeout(() => { morphWord.textContent = word; morphWord.style.opacity = '1'; }, 280);
    $$('button', morphSwitch).forEach((b) => b.classList.toggle('active', b.dataset.word === word));
  }
  if (morphSwitch) {
    $$('button', morphSwitch).forEach((b) =>
      b.addEventListener('click', () => { clearInterval(morphTimer); setMorph(b.dataset.word); })
    );
    if (!reduce) {
      const words = ['Qazaqstan', 'Kazakstan', 'Kazakhstan'];
      let idx = 0;
      morphTimer = setInterval(() => { idx = (idx + 1) % words.length; setMorph(words[idx]); }, 3000);
    }
  }

  /* ---------- Modal (article card) ---------- */
  const modal = $('#modal');
  const modalHero = $('#modalHero');
  function openModal(item) {
    if (!modal || !item) return;
    $('#modalCat').textContent = item.cat || 'Статья';
    $('#modalTitle').textContent = item.title || '';
    $('#modalText').innerHTML = (item.text || []).map((p) => `<p>${p}</p>`).join('');
    $('#modalFact').textContent = item.fact || '';
    $('#modalMapLabel').textContent = item.title || 'Казахстан';
    const pin = $('#modalPin');
    if (item.map && pin) { pin.style.left = item.map[0] + '%'; pin.style.top = item.map[1] + '%'; }
    if (item.img) {
      modalHero.style.backgroundImage = `url('${item.img}')`;
      modalHero.classList.remove('placeholder');
    } else {
      modalHero.style.backgroundImage = '';
      modalHero.classList.add('placeholder');
    }
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  $('#modalClose') && $('#modalClose').addEventListener('click', closeModal);
  modal && modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  const modalAudio = $('#modalAudio');
  if (modalAudio) modalAudio.addEventListener('click', () => modalAudio.classList.toggle('playing'));

  /* ---------- Custom cursor accent ---------- */
  const dot = $('#cursorDot'), ring = $('#cursorRing');
  if (dot && ring && window.matchMedia('(hover: hover)').matches && !reduce) {
    let rx = 0, ry = 0, dx = 0, dy = 0;
    document.addEventListener('mousemove', (e) => {
      dx = e.clientX; dy = e.clientY;
      dot.style.transform = `translate(${dx}px, ${dy}px) translate(-50%,-50%)`;
    });
    (function loop() {
      rx += (dx - rx) * 0.18; ry += (dy - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
    const grow = () => { ring.style.width = '54px'; ring.style.height = '54px'; ring.style.opacity = '0.9'; };
    const shrink = () => { ring.style.width = '34px'; ring.style.height = '34px'; ring.style.opacity = '0.5'; };
    $$('a, button, .card, .symbol, .kuy').forEach((el) => {
      el.addEventListener('mouseenter', grow);
      el.addEventListener('mouseleave', shrink);
    });
  } else if (dot && ring) {
    dot.style.display = 'none'; ring.style.display = 'none';
  }
})();
