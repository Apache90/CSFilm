/* CS Film — interacción
   Sin dependencias. Cada bloque funciona por su cuenta y se salta si su markup no está. */

(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Timecode (24 fps) ---------- */

  const FPS = 24;
  const pad = (n) => String(n).padStart(2, '0');
  const toTimecode = (frames) => {
    const f = Math.max(0, Math.round(frames));
    const ff = f % FPS;
    const totalSeconds = Math.floor(f / FPS);
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(ff)}`;
  };

  /* ---------- Intro: loader + apertura del hero ---------- */

  function initIntro() {
    const hero = $('.hero');
    if (!hero) return;
    const startHero = () => hero.classList.add('is-on');

    const loader = $('[data-loader]');
    if (!root.classList.contains('intro') || !loader) {
      requestAnimationFrame(() => requestAnimationFrame(startHero));
      return;
    }

    const tcEl = $('[data-loader-tc]', loader);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t) => {
      tcEl.textContent = toTimecode(((t - t0) / 1000) * FPS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const heroMedia = $('.hero-media', hero);
    const mediaReady = new Promise((resolve) => {
      if (!heroMedia) return resolve();
      if (heroMedia.tagName === 'VIDEO') {
        if (heroMedia.readyState >= 2) return resolve();
        heroMedia.addEventListener('loadeddata', resolve, { once: true });
      } else {
        if (heroMedia.complete) return resolve();
        heroMedia.addEventListener('load', resolve, { once: true });
      }
      heroMedia.addEventListener('error', resolve, { once: true });
    });
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const minDelay = new Promise((r) => setTimeout(r, 1300));
    const maxDelay = new Promise((r) => setTimeout(r, 3800));

    Promise.race([Promise.all([mediaReady, fontsReady, minDelay]), maxDelay]).then(() => {
      cancelAnimationFrame(raf);
      loader.classList.add('is-done');
      try { sessionStorage.setItem('csf-intro', '1'); } catch (e) { /* almacenamiento bloqueado: se repite el intro, sin problema */ }
      setTimeout(startHero, 380);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        loader.remove();
        root.classList.remove('intro');
      };
      loader.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 1400);
    });
  }

  /* ---------- Reveal escalonado al entrar en cuadro ---------- */

  function initReveal() {
    const items = $$('[data-reveal]');
    if (!items.length) return;

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }

    // Los elementos que entran juntos se escalonan 90 ms entre sí
    const io = new IntersectionObserver((entries) => {
      const entering = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      entering
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        .forEach((el, i) => {
          el.style.setProperty('--d', `${Math.min(i, 6) * 0.09}s`);
          el.classList.add('is-in');
          io.unobserve(el);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach((el) => io.observe(el));
  }

  /* ---------- Header, menú móvil, HUD y escenas ---------- */

  function initChrome() {
    const header = $('[data-header]');
    const hud = $('[data-hud]');
    const hudTc = $('[data-hud-tc]');
    const hudScene = $('[data-hud-scene]');
    const scenes = $$('[data-scene]');
    const navLinks = $$('.nav a');
    const tcIns = $$('[data-tc-in]');

    // Timecode de entrada de cada escena = su posición en el documento (1 px = 1 fotograma)
    const sceneTops = new Map();
    const measure = () => {
      scenes.forEach((s) => sceneTops.set(s, s.getBoundingClientRect().top + window.scrollY));
      tcIns.forEach((el) => {
        const scene = el.closest('[data-scene]');
        if (scene) el.textContent = toTimecode(sceneTops.get(scene));
      });
    };

    const sceneAt = (y) => {
      for (let i = scenes.length - 1; i >= 0; i--) {
        const r = scenes[i].getBoundingClientRect();
        if (r.top <= y && r.bottom > y) return scenes[i];
      }
      return null;
    };
    const themeOf = (scene) => (scene && scene.classList.contains('scene--paper') ? 'paper' : 'dark');

    let lastY = window.scrollY;
    let ticking = false;
    let currentId = '';

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;

      // Ocultar el header al bajar, mostrarlo al subir
      if (header && !root.classList.contains('menu-open')) {
        const goingDown = y > lastY && y > vh * 0.4;
        header.classList.toggle('is-hidden', goingDown);
        header.classList.toggle('is-solid', y > 8);
      }
      lastY = y;

      // Color del header y del HUD según la escena que tienen debajo
      if (header) header.dataset.theme = themeOf(sceneAt(30));
      if (hud) {
        hud.dataset.theme = themeOf(sceneAt(vh - 20));
        hud.classList.toggle('is-visible', y > vh * 0.25);
        hudTc.textContent = toTimecode(y);
      }

      // Escena actual: la que ocupa la mitad de la pantalla
      const current = sceneAt(vh * 0.5);
      if (current && current.id !== currentId) {
        currentId = current.id;
        if (hudScene) hudScene.textContent = current.dataset.scene;
        navLinks.forEach((a) => {
          if (a.getAttribute('href') === `#${currentId}`) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { measure(); onScroll(); });
    window.addEventListener('load', measure);

    // Menú móvil
    const toggle = $('[data-menu-toggle]');
    const menu = $('[data-menu]');
    if (!toggle || !menu) return;

    $$('nav a', menu).forEach((a, i) => a.style.setProperty('--i', i));

    const setMenu = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Cerrar' : 'Menú';
      root.classList.toggle('menu-open', open);
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
        const first = $('a', menu);
        if (first) first.focus({ preventScroll: true });
      } else {
        menu.classList.remove('is-open');
        menu.hidden = true;
      }
    };

    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  /* ---------- Galería: filtros ---------- */

  function initFilters() {
    const bar = $('[data-filters]');
    const gallery = $('[data-gallery]');
    if (!bar || !gallery) return;
    const status = $('[data-filter-status]');
    const shots = $$('.shot', gallery);

    const apply = (cat, label) => {
      const run = () => {
        let count = 0;
        shots.forEach((shot) => {
          const show = cat === 'all' || shot.dataset.cat === cat;
          shot.hidden = !show;
          if (show) {
            count++;
            // Volver a escalonar la entrada de los visibles
            if (!reducedMotion.matches) {
              shot.classList.remove('is-in');
              shot.style.setProperty('--d', `${Math.min(count - 1, 6) * 0.07}s`);
            }
          }
        });
        gallery.classList.remove('is-switching');
        if (!reducedMotion.matches) {
          requestAnimationFrame(() => requestAnimationFrame(() => shots.forEach((s) => !s.hidden && s.classList.add('is-in'))));
        }
        if (status) status.textContent = `${count} trabajos: ${label}`;
        window.dispatchEvent(new Event('resize')); // recalcula timecodes de escena
      };

      if (reducedMotion.matches) return run();
      gallery.classList.add('is-switching');
      setTimeout(run, 320);
    };

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
      $$('[data-filter]', bar).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      apply(btn.dataset.filter, btn.firstChild.textContent.trim());
    });
  }

  /* ---------- Lightbox (fotos y video) ---------- */

  function initLightbox() {
    const dialog = $('[data-lightbox]');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const stage = $('[data-lb-stage]', dialog);
    const titleEl = $('[data-lb-title]', dialog);
    const metaEl = $('[data-lb-meta]', dialog);
    const countEl = $('[data-lb-count]', dialog);
    const nav = $('[data-lb-nav]', dialog);
    const prevBtn = $('[data-lb-prev]', dialog);
    const nextBtn = $('[data-lb-next]', dialog);

    let items = [];
    let index = 0;
    let opener = null;

    const render = () => {
      const item = items[index];
      stage.replaceChildren();

      if (item.type === 'video') {
        if (item.embed) {
          const iframe = document.createElement('iframe');
          iframe.src = item.embed;
          iframe.title = item.title;
          iframe.allow = 'autoplay; fullscreen; picture-in-picture';
          iframe.allowFullscreen = true;
          stage.append(iframe);
        } else {
          const video = document.createElement('video');
          video.src = item.src;
          video.controls = true;
          video.autoplay = true;
          video.playsInline = true;
          video.preload = 'auto';
          if (item.poster) video.poster = item.poster;
          stage.append(video);
          // iOS ignora autoplay en videos con sonido; play() dentro del toque sí está permitido
          const playing = video.play();
          if (playing && playing.catch) playing.catch(() => { /* queda con controles para tocar play */ });
        }
      } else {
        const img = new Image();
        img.decoding = 'async';
        img.alt = item.alt;
        img.src = item.src;
        stage.append(img);
      }

      titleEl.textContent = item.title;
      metaEl.textContent = item.meta;
      countEl.textContent = items.length > 1 ? `${index + 1} de ${items.length}` : '';
      nav.hidden = items.length < 2;
    };

    const open = (list, i, trigger) => {
      items = list;
      index = i;
      opener = trigger;
      render();
      dialog.showModal();
      stage.focus({ preventScroll: true }); // las flechas y Esc funcionan sin marcar "Cerrar"
      root.style.overflow = 'hidden';
    };

    const step = (dir) => {
      if (items.length < 2) return;
      index = (index + dir + items.length) % items.length;
      render();
    };

    dialog.addEventListener('close', () => {
      stage.replaceChildren(); // detiene y libera el video
      root.style.overflow = '';
      if (opener) opener.focus({ preventScroll: true });
    });

    $('[data-lb-close]', dialog).addEventListener('click', () => dialog.close());
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));
    stage.addEventListener('click', (e) => { if (e.target === stage) dialog.close(); });

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });

    // Deslizar en pantallas táctiles
    let touchX = null;
    stage.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      touchX = null;
    }, { passive: true });

    // Fotos de la galería: navegan solo entre las visibles según el filtro
    const gallery = $('[data-gallery]');
    if (gallery) {
      gallery.addEventListener('click', (e) => {
        const btn = e.target.closest('.shot-btn');
        if (!btn) return;
        const visible = $$('.shot:not([hidden]) .shot-btn', gallery);
        const list = visible.map((b) => ({
          type: 'image',
          src: b.dataset.full || $('img', b).currentSrc,
          alt: $('img', b).alt,
          title: $('.shot-title', b).textContent,
          meta: $('.shot-meta', b).textContent,
        }));
        open(list, visible.indexOf(btn), btn);
      });
    }

    // Videos del reel: se cargan recién al abrir
    const reel = $('[data-reel]');
    if (reel) {
      reel.addEventListener('click', (e) => {
        const btn = e.target.closest('.reel-btn');
        if (!btn) return;
        const buttons = $$('.reel-btn', reel);
        const list = buttons.map((b) => ({
          type: 'video',
          src: b.dataset.video,
          embed: b.dataset.embed,
          poster: $('img', b).currentSrc,
          title: b.dataset.title,
          meta: b.dataset.meta,
        }));
        open(list, buttons.indexOf(btn), btn);
      });
    }
  }

  /* ---------- Reel horizontal: controles y arrastre ---------- */

  function initReel() {
    const reel = $('[data-reel]');
    if (!reel) return;
    const items = $$('.reel-item', reel);
    const prev = $('[data-reel-prev]');
    const next = $('[data-reel-next]');
    const count = $('[data-reel-count]');

    const stride = () => (items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : reel.clientWidth);
    const currentIndex = () => {
      if (reel.scrollLeft + reel.clientWidth >= reel.scrollWidth - 4) return items.length - 1;
      return Math.round(reel.scrollLeft / stride());
    };

    const sync = () => {
      const i = currentIndex();
      if (count) count.textContent = `${i + 1} de ${items.length}`;
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= items.length - 1;
    };

    const go = (dir) => {
      const target = Math.max(0, Math.min(items.length - 1, currentIndex() + dir));
      reel.scrollTo({ left: items[target].offsetLeft - items[0].offsetLeft, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    };

    prev && prev.addEventListener('click', () => go(-1));
    next && next.addEventListener('click', () => go(1));
    reel.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    window.addEventListener('resize', sync);
    sync();

    // Arrastre con mouse (en táctil ya es nativo)
    let startX = 0;
    let startScroll = 0;
    let pointerId = null;
    let dragged = false;

    reel.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = reel.scrollLeft;
      dragged = false;
    });

    reel.addEventListener('pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 6) {
        dragged = true;
        reel.classList.add('is-dragging');
        reel.setPointerCapture(pointerId);
      }
      if (dragged) reel.scrollLeft = startScroll - dx;
    });

    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragged) return;
      reel.classList.remove('is-dragging');
      // Reengancha el snap al cuadro más cercano
      const i = Math.round(reel.scrollLeft / stride());
      reel.scrollTo({ left: items[Math.max(0, Math.min(items.length - 1, i))].offsetLeft - items[0].offsetLeft, behavior: 'smooth' });
    };
    reel.addEventListener('pointerup', end);
    reel.addEventListener('pointercancel', end);

    // Un arrastre no debe abrir el video
    reel.addEventListener('click', (e) => {
      if (dragged) {
        e.preventDefault();
        e.stopImmediatePropagation();
        dragged = false;
      }
    }, true);
  }

  /* ---------- Formulario de contacto ---------- */

  function initContactForm() {
    const form = $('[data-contact-form]');
    if (!form) return;
    const status = $('[data-form-status]', form);
    const submit = $('button[type="submit"]', form);
    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

    const checks = [
      { field: form.elements.nombre, error: $('#f-name-err'), valid: (v) => v.trim().length > 0 },
      { field: form.elements.email, error: $('#f-email-err'), valid: (v) => emailOk(v.trim()) },
      { field: form.elements.mensaje, error: $('#f-msg-err'), valid: (v) => v.trim().length >= 10 },
    ];

    const setError = ({ field, error }, invalid) => {
      field.setAttribute('aria-invalid', String(invalid));
      if (invalid) field.setAttribute('aria-describedby', error.id);
      else field.removeAttribute('aria-describedby');
      error.hidden = !invalid;
    };

    checks.forEach((c) => {
      c.field.addEventListener('blur', () => { if (c.field.value) setError(c, !c.valid(c.field.value)); });
      c.field.addEventListener('input', () => { if (c.field.getAttribute('aria-invalid') === 'true' && c.valid(c.field.value)) setError(c, false); });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.classList.remove('is-ok');

      const invalid = checks.filter((c) => !c.valid(c.field.value));
      checks.forEach((c) => setError(c, invalid.includes(c)));
      if (invalid.length) {
        invalid[0].field.focus();
        status.textContent = invalid.length === 1 ? 'Falta completar un campo.' : `Faltan completar ${invalid.length} campos.`;
        return;
      }

      const data = new FormData(form);
      const endpoint = form.dataset.endpoint;

      if (endpoint) {
        submit.disabled = true;
        status.textContent = 'Enviando consulta…';
        try {
          const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          status.textContent = 'Consulta enviada. Te respondo en menos de 48 h hábiles.';
          status.classList.add('is-ok');
        } catch (err) {
          status.textContent = `No se pudo enviar la consulta. Probá de nuevo o escribime directo a ${form.dataset.mailto}.`;
        } finally {
          submit.disabled = false;
        }
        return;
      }

      // Sin servicio configurado: se arma el mail en el cliente de correo
      const subject = `Consulta: ${data.get('tipo')} | ${data.get('nombre')}`;
      const body = [
        `Nombre: ${data.get('nombre')}`,
        `Email: ${data.get('email')}`,
        data.get('empresa') ? `Marca o agencia: ${data.get('empresa')}` : null,
        `Tipo de proyecto: ${data.get('tipo')}`,
        data.get('fecha') ? `Fecha estimada: ${data.get('fecha')}` : null,
        `Presupuesto: ${data.get('presupuesto')}`,
        '',
        data.get('mensaje'),
      ].filter((line) => line !== null).join('\n');

      window.location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      status.textContent = 'Se abrió tu correo con la consulta lista. Solo falta enviarla.';
      status.classList.add('is-ok');
    });
  }

  /* ---------- Varios ---------- */

  function initYear() {
    const el = $('[data-year]');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  initIntro();
  initChrome();
  initReveal();
  initFilters();
  initLightbox();
  initReel();
  initContactForm();
  initYear();
})();
