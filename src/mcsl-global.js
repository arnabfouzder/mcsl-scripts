(function () {
  'use strict';

  // =========================================================
  // MCSL GLOBAL SCRIPT
  // Barba page transitions (Lottie) + Lenis + Webflow re-init
  // + every page script, scoped to the swapped container.
  //
  // To add a new page script: write an init function that takes
  // the container, register its cleanup with onCleanup(), and add
  // it to initPageFunctions() below.
  //
  // Source of truth: github.com/arnabfouzder/mcsl-scripts
  // Edit this file, run `npm run build`, tag a new version and
  // update the version in the Webflow footer URL (see README).
  // =========================================================

  // ---------- Settings ----------
  var LOTTIE_DURATION = 1.5;  // seconds each transition Lottie plays for
  var LOGO_HOLD = 0.6;        // seconds the logo stays on screen before the cover lifts
  var FADE_DURATION = 0.25;   // navy colour + logo fade
  var RELEASE_AT = 0.3;       // share of the "out" Lottie after which the page is usable
  var FIRST_LOAD_WAIT = 600;  // ms to wait for the Lottie on first load before a plain fade
  var LENIS_OPTIONS = { lerp: 0.1, wheelMultiplier: 0.7 };
  var FOOTER_SHIFT = -25;     // % the footer content starts above its resting spot
  var HERO_SHIFT = 25;        // % the hero content drifts down as it scrolls away
  var PARALLAX_DARK = 0.5;    // strongest opacity of the dark overlay on footer and hero

  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = typeof window.ScrollTrigger !== 'undefined';
  var isEditor = !!(window.Webflow && Webflow.env && Webflow.env('editor'));
  if (hasGSAP && hasST) gsap.registerPlugin(ScrollTrigger);

  var rmMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reducedMotion = rmMQ.matches;
  if (rmMQ.addEventListener) rmMQ.addEventListener('change', function (e) { reducedMotion = e.matches; });

  // ---------- Helpers ----------
  var scriptPromises = {};
  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return scriptPromises[src];
  }

  // Cleanups registered by page scripts, run when the page leaves
  var pageCleanups = [];
  function onCleanup(fn) { pageCleanups.push(fn); }
  function runPageCleanups() {
    var fns = pageCleanups;
    pageCleanups = [];
    fns.forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[mcsl] cleanup failed', e); }
    });
  }

  function safe(name, fn) {
    try { fn(); } catch (e) { console.warn('[mcsl] ' + name + ' failed', e); }
  }

  // =========================================================
  // LENIS
  // =========================================================
  var lenis = null;

  function initLenis() {
    if (lenis || isEditor || typeof window.Lenis === 'undefined') return;
    lenis = new Lenis(LENIS_OPTIONS);
    window.lenis = lenis;

    if (hasST) lenis.on('scroll', ScrollTrigger.update);
    if (hasGSAP) {
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })();
    }

    // Optional controls: [data-lenis-start] / [data-lenis-stop] / [data-lenis-toggle]
    document.addEventListener('click', function (e) {
      if (!lenis) return;
      if (e.target.closest('[data-lenis-start]')) lenis.start();
      if (e.target.closest('[data-lenis-stop]')) lenis.stop();
      var toggle = e.target.closest('[data-lenis-toggle]');
      if (toggle) {
        toggle.classList.toggle('stop-scroll');
        toggle.classList.contains('stop-scroll') ? lenis.stop() : lenis.start();
      }
    });
  }

  // Scroll positions for every ScrollTrigger are measured once. Images,
  // video, Lotties and counters keep changing the page height after that
  // (Home grows by 2000px+), which left the footer parallax and reveals
  // firing far above where their elements end up. Re-measure whenever the
  // page height actually changes.
  function watchPageHeight() {
    if (!hasST || typeof ResizeObserver === 'undefined') return;
    var lastHeight = document.documentElement.scrollHeight;
    var timer = null;
    new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var h = document.documentElement.scrollHeight;
        if (Math.abs(h - lastHeight) < 2) return;
        lastHeight = h;
        if (lenis) lenis.resize();
        refreshScroll();
      }, 200);
    }).observe(document.body);
  }

  // ScrollTrigger measures triggers in the order they were created. Webflow
  // creates its own (e.g. the pinned scroll-break section on Home) after
  // ours, so a pin above the footer was measured too late and everything
  // below it ended up one screen off. Sorting first puts them in page order.
  function refreshScroll() {
    if (!hasST) return;
    if (typeof ScrollTrigger.sort === 'function') ScrollTrigger.sort();
    ScrollTrigger.refresh();
  }

  function scrollToTop() {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
  }

  function scrollToHash() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var target = null;
    try { target = document.querySelector(hash); } catch (e) { return; }
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
    else target.scrollIntoView();
  }

  // =========================================================
  // NAV (lives outside the Barba container, initialised once)
  // =========================================================
  var Nav = (function () {
    var DEFAULT_THEME = 'light';
    var themeSections = [];
    var currentTheme = null;
    var currentBg = null;
    var themeTicking = false;
    var themeOffset = 0;
    var lastY = 0;
    var hideTicking = false;

    // ---------- Basic Navigation Bar ----------
    function initBasicNavigationBar() {
      document.querySelectorAll('[data-nav-status]').forEach(function (nav) {
        var controls = nav.querySelectorAll('[data-nav-control]');
        var subNavs = nav.querySelectorAll('[data-nav-sub-status]');
        var toggle = nav.querySelector('[data-nav-control="toggle"]');

        function setNav(active) {
          nav.setAttribute('data-nav-status', active ? 'active' : 'not-active');
          lockScrollForMenu(active);
          if (toggle) {
            toggle.setAttribute('aria-expanded', active);
            toggle.setAttribute('aria-label', active ? 'Close navigation' : 'Open navigation');
          }
          if (!active) subNavs.forEach(function (subNav) {
            subNav.setAttribute('data-nav-sub-status', 'not-active');
            var c = subNav.querySelector('[data-nav-sub-control]');
            if (c) c.setAttribute('aria-expanded', 'false');
          });
        }
        nav._setNav = setNav;

        controls.forEach(function (control) {
          control.addEventListener('click', function () {
            var action = control.getAttribute('data-nav-control');
            var active = nav.getAttribute('data-nav-status') === 'active';
            setNav(action === 'open' || (action === 'toggle' && !active));
          });
        });

        subNavs.forEach(function (subNav) {
          var control = subNav.querySelector('[data-nav-sub-control]');
          if (!control) return;
          control.addEventListener('click', function () {
            if (!window.matchMedia('(max-width: 991px)').matches) return;
            var active = subNav.getAttribute('data-nav-sub-status') === 'active';
            subNavs.forEach(function (item) {
              item.setAttribute('data-nav-sub-status', 'not-active');
              var c = item.querySelector('[data-nav-sub-control]');
              if (c) c.setAttribute('aria-expanded', 'false');
            });
            if (!active) {
              subNav.setAttribute('data-nav-sub-status', 'active');
              control.setAttribute('aria-expanded', 'true');
            }
          });
        });

        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && nav.getAttribute('data-nav-status') === 'active') {
            setNav(false);
            if (toggle) toggle.focus();
          }
        });

        setNav(false);
      });
    }

    // Freeze page scrolling while the mobile menu is open
    var menuLocked = false;
    function lockScrollForMenu(open) {
      if (!lenis) return;
      if (open && !lenis.isStopped) { lenis.stop(); menuLocked = true; }
      else if (!open && menuLocked) {
        menuLocked = false;
        var transitioning = window.barba && barba.transitions && barba.transitions.isRunning;
        if (!transitioning) lenis.start();
      }
    }

    function close() {
      document.querySelectorAll('[data-nav-status="active"]').forEach(function (nav) {
        if (nav._setNav) nav._setNav(false);
        else nav.setAttribute('data-nav-status', 'not-active');
      });
    }

    // Close the menu after tapping a link, or when resizing up to desktop
    function initNavExtras() {
      document.querySelectorAll('[data-nav-status]').forEach(function (nav) {
        nav.querySelectorAll('[data-nav-list] a').forEach(function (a) { a.addEventListener('click', close); });
      });
      var desktop = window.matchMedia('(min-width: 992px)');
      if (desktop.addEventListener) desktop.addEventListener('change', function (e) { if (e.matches) close(); });
    }

    // ---------- Check Section Theme on Scroll ----------
    // Sections without data-theme-section fall back to DEFAULT_THEME,
    // so only dark sections need data-theme-section="dark".
    function setAttr(selector, attr, value) {
      document.querySelectorAll(selector).forEach(function (el) { el.setAttribute(attr, value); });
    }

    function checkTheme() {
      var matched = false;
      for (var i = 0; i < themeSections.length; i++) {
        var section = themeSections[i];
        if (!section.isConnected) continue;
        var rect = section.getBoundingClientRect();
        if (rect.top <= themeOffset && rect.bottom >= themeOffset) {
          var theme = section.getAttribute('data-theme-section');
          var bg = section.getAttribute('data-bg-section');
          matched = true;
          if (theme !== currentTheme) { setAttr('[data-theme-nav]', 'data-theme-nav', theme); currentTheme = theme; }
          if (bg && bg !== currentBg) { setAttr('[data-bg-nav]', 'data-bg-nav', bg); currentBg = bg; }
          break;
        }
      }
      if (!matched && currentTheme !== DEFAULT_THEME) {
        setAttr('[data-theme-nav]', 'data-theme-nav', DEFAULT_THEME);
        currentTheme = DEFAULT_THEME;
      }
      themeTicking = false;
    }

    function requestThemeCheck() {
      if (themeTicking) return;
      themeTicking = true;
      requestAnimationFrame(checkTheme);
    }

    function refreshTheme() {
      var bar = document.querySelector('[data-nav-bar-height]');
      themeOffset = bar ? bar.offsetHeight / 2 : 0;
      themeSections = Array.prototype.slice.call(document.querySelectorAll('[data-theme-section]'));
      currentTheme = null;
      currentBg = null;
      checkTheme();
    }

    function initTheme() {
      window.addEventListener('scroll', requestThemeCheck, { passive: true });
      window.addEventListener('resize', function () { refreshTheme(); });
      refreshTheme();
    }

    // ---------- Hide on scroll down, show on scroll up ----------
    function setHidden(hidden) {
      document.querySelectorAll('.mcsl-nav[data-nav-status]').forEach(function (nav) {
        nav.setAttribute('data-nav-hidden', hidden ? 'true' : 'false');
      });
    }

    function updateHide() {
      var DELTA = 8;
      var y = Math.max(window.scrollY, 0);
      var diff = y - lastY;
      var nav = document.querySelector('.mcsl-nav[data-nav-status]');
      var bar = document.querySelector('[data-nav-bar-height]');
      var menuOpen = nav && nav.getAttribute('data-nav-status') === 'active';
      var topZone = bar ? bar.offsetHeight : 100;

      if (menuOpen || y <= topZone) setHidden(false);
      else if (diff > DELTA) setHidden(true);
      else if (diff < -DELTA) setHidden(false);

      if (Math.abs(diff) > DELTA) lastY = y;
      hideTicking = false;
    }

    function initHide() {
      lastY = Math.max(window.scrollY, 0);
      window.addEventListener('scroll', function () {
        if (hideTicking) return;
        hideTicking = true;
        requestAnimationFrame(updateHide);
      }, { passive: true });
      document.querySelectorAll('.mcsl-nav[data-nav-status]').forEach(function (nav) {
        nav.addEventListener('focusin', function () { setHidden(false); });
      });
      setHidden(false);
    }

    function resetHide() {
      lastY = 0;
      setHidden(false);
    }

    // ---------- Current-page link state (data-barba-update) ----------
    // Copies class + aria-current from the next page's HTML onto the
    // nav links, so the current-page underline follows the page.
    function updateCurrent(nextHtml) {
      var tpl = document.createElement('template');
      tpl.innerHTML = nextHtml.trim();
      var nextNodes = tpl.content.querySelectorAll('[data-barba-update]');
      var currentNodes = document.querySelectorAll('nav [data-barba-update]');
      currentNodes.forEach(function (curr, index) {
        var next = nextNodes[index];
        if (!next) return;
        var status = next.getAttribute('aria-current');
        if (status !== null) curr.setAttribute('aria-current', status);
        else curr.removeAttribute('aria-current');
        curr.setAttribute('class', next.getAttribute('class') || '');
      });
    }

    function init() {
      safe('nav: basic', initBasicNavigationBar);
      safe('nav: extras', initNavExtras);
      safe('nav: theme', initTheme);
      safe('nav: hide', initHide);
    }

    return { init: init, close: close, refreshTheme: refreshTheme, resetHide: resetHide, updateCurrent: updateCurrent };
  })();

  // =========================================================
  // LOTTIE PAGE TRANSITION (uses Webflow's own Lottie players)
  // Cover : "Trans In" plays, then navy colour + logo fade in
  // Reveal: colour + logo fade out, then "Trans Out" plays
  // =========================================================
  var Transition = (function () {
    function els() {
      var wrap = document.querySelector('.transition');
      if (!wrap) return null;
      return {
        wrap: wrap,
        color: wrap.querySelector('.transition-color'),
        logo: wrap.querySelector('.transition-logo-img'),
        lottieIn: wrap.querySelector('.transition-lottie-in'),
        lottieOut: wrap.querySelector('.transition-lottie-out')
      };
    }

    // Resolve the Webflow Lottie instance for an element once it has loaded
    function getAnim(el, timeout) {
      return new Promise(function (resolve) {
        if (!el || !window.Webflow) return resolve(null);
        var start = performance.now();
        (function check() {
          var anim = null;
          try {
            var L = Webflow.require('lottie').lottie;
            anim = L.getRegisteredAnimations().find(function (a) { return a.wrapper === el; });
          } catch (e) {}
          if (anim && anim.isLoaded && anim.totalFrames) return resolve(anim);
          if (performance.now() - start > timeout) return resolve(null);
          setTimeout(check, 40);
        })();
      });
    }

    function lastFrame(anim) { return Math.max(0, anim.totalFrames - 1); }

    function playFrames(anim, from, to, duration) {
      var proxy = { f: from };
      anim.goToAndStop(from, true);
      return gsap.to(proxy, {
        f: to,
        duration: duration,
        ease: 'none',
        onUpdate: function () { anim.goToAndStop(proxy.f, true); }
      });
    }

    function done(tl) {
      return new Promise(function (resolve) { tl.eventCallback('onComplete', resolve); });
    }

    // Only one transition timeline at a time: a new cover/reveal
    // cancels whatever is still playing (e.g. a click mid-reveal).
    var active = null, runId = 0;
    function start(tl) {
      if (active) active.kill();
      active = tl;
      tl.play();
      // Watchdog: a background tab, DevTools or a slow device can pause
      // GSAP's ticker. If the timeline hasn't finished shortly after it
      // should have, jump it to the end so the overlay never gets stuck.
      var limit = (tl.duration() + 1.5) * 1000;
      var startedAt = Date.now();
      function finishIfStuck() {
        if (active !== tl || tl.progress() === 1) return;
        if (Date.now() - startedAt >= limit) { tl.progress(1); flushReveals(); }
        else setTimeout(finishIfStuck, 250);
      }
      setTimeout(finishIfStuck, limit);
      return done(tl);
    }

    // Coming back to the tab: settle anything that ran over
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !active) return;
      var tl = active;
      setTimeout(function () {
        if (active === tl && tl.progress() < 1 && !tl.isActive()) { tl.progress(1); flushReveals(); }
      }, 300);
    });

    function cover() {
      var t = els();
      if (!t || !hasGSAP) return Promise.resolve();
      var id = ++runId;
      return Promise.all([getAnim(t.lottieIn, 1500), getAnim(t.lottieOut, 1500)]).then(function (anims) {
        if (id !== runId) return;
        var aIn = anims[0], aOut = anims[1];
        gsap.killTweensOf([t.color, t.logo]);
        if (aOut) aOut.goToAndStop(lastFrame(aOut), true); // "out" finished = empty
        if (aIn) aIn.goToAndStop(0, true);                 // "in" start = empty
        gsap.set([t.color, t.logo], { opacity: 0 });
        gsap.set(t.wrap, { display: 'block', pointerEvents: 'auto' });

        var tl = gsap.timeline({ paused: true });
        if (aIn && !reducedMotion) tl.add(playFrames(aIn, 0, lastFrame(aIn), LOTTIE_DURATION));
        tl.to(t.color, { opacity: 1, duration: FADE_DURATION, ease: 'sine.out' });
        tl.to(t.logo, { opacity: 1, duration: FADE_DURATION }, '<');
        return start(tl);
      });
    }

    // Lifts the cover. onStart runs just before it starts lifting (arms the
    // scroll reveals so content animates in as the page appears). The
    // returned promise resolves once the page is visible and clickable,
    // part-way through the "out" Lottie: the rest of the Lottie keeps
    // playing on top with pointer events off, so Barba and the visitor are
    // never kept waiting for the tail of the animation.
    function reveal(lottieWait, onStart) {
      var t = els();
      if (!t || !hasGSAP) {
        if (t) t.wrap.style.display = 'none';
        if (onStart) onStart();
        return Promise.resolve();
      }
      var id = ++runId;
      var wait = lottieWait || 3000;
      return Promise.all([getAnim(t.lottieIn, wait), getAnim(t.lottieOut, wait)]).then(function (anims) {
        if (id !== runId) return;
        var aIn = anims[0], aOut = anims[1];
        var animate = aOut && !reducedMotion;
        gsap.set(t.wrap, { display: 'block', pointerEvents: 'auto' });
        if (aIn) aIn.goToAndStop(0, true);
        if (aOut) aOut.goToAndStop(animate ? 0 : lastFrame(aOut), true); // "out" start = full cover

        var released = false, resolveVisible;
        var visible = new Promise(function (r) { resolveVisible = r; });
        function release() {
          if (released) return;
          released = true;
          t.wrap.style.pointerEvents = 'none';
          resolveVisible();
        }

        var tl = gsap.timeline({ paused: true });
        var hold = reducedMotion ? 0 : LOGO_HOLD;
        gsap.set([t.logo, t.color], { opacity: 1 });
        // Logo holds on the navy cover, then the cover lifts. Reveals are
        // armed as it starts lifting so they play where they can be seen.
        if (onStart) tl.call(function () { safe('reveal start', onStart); }, null, hold);
        tl.to([t.logo, t.color], { opacity: 0, duration: FADE_DURATION, ease: 'quart.out' }, hold);
        if (animate) {
          tl.add(playFrames(aOut, 0, lastFrame(aOut), LOTTIE_DURATION), '+=0.05');
          tl.call(release, null, '<' + (LOTTIE_DURATION * RELEASE_AT).toFixed(2));
        } else {
          tl.call(release);
        }
        tl.set(t.wrap, { display: 'none', pointerEvents: 'none' });
        start(tl).then(release);
        return visible;
      });
    }

    function hide() {
      runId++;
      if (active) { active.kill(); active = null; }
      var t = els();
      if (t) t.wrap.style.display = 'none';
    }

    return { cover: cover, reveal: reveal, hide: hide };
  })();

  // =========================================================
  // WEBFLOW RE-INIT after a Barba swap
  // IX2 restarts from its stored data. IX3 only registers its
  // interactions once on first load, so they are re-registered
  // from the copy captured before Webflow is destroyed.
  // =========================================================
  var ix3Cache = null;

  function captureIx3() {
    try {
      var inst = Webflow.require('ix3').getInstance();
      if (inst && inst.interactions && inst.interactions.size) {
        ix3Cache = {
          interactions: Array.from(inst.interactions.values()),
          timelines: Array.from(inst.timelineDefs.values())
        };
      }
    } catch (e) {}
  }

  function reinitWebflow(nextHtml) {
    if (!window.Webflow) return Promise.resolve();
    var doc = new DOMParser().parseFromString(nextHtml, 'text/html');

    var pageId = doc.documentElement.getAttribute('data-wf-page');
    if (pageId) document.documentElement.setAttribute('data-wf-page', pageId);
    if (doc.title) document.title = doc.title;

    // Keep the wrapper's combo classes in sync (e.g. .overflow-timeline)
    var nextWrapper = doc.querySelector('[data-barba="wrapper"]');
    var wrapper = document.querySelector('[data-barba="wrapper"]');
    if (nextWrapper && wrapper) wrapper.className = nextWrapper.className;

    captureIx3();

    safe('webflow destroy', function () { Webflow.destroy(); });
    safe('webflow ready', function () { Webflow.ready(); });
    safe('ix2 init', function () { Webflow.require('ix2').init(); });

    var ix3 = null;
    try { ix3 = Webflow.require('ix3'); } catch (e) {}
    if (!ix3 || !ix3.ready) return Promise.resolve();

    return Promise.resolve(ix3.ready()).then(function () {
      var inst = ix3.getInstance();
      if (inst && ix3Cache && !(inst.interactions && inst.interactions.size)) {
        if (inst.setFeatures) inst.setFeatures({ timelineGroups: false });
        inst.register(ix3Cache.interactions, ix3Cache.timelines);
      }
    }).catch(function (e) { console.warn('[mcsl] ix3 re-init failed', e); });
  }

  // =========================================================
  // PAGE SCRIPTS (each scoped to the container + cleaned up on leave)
  // =========================================================

  // ---------- Bunny HLS background video (Home hero) ----------
  function initBunnyPlayerBackground(container) {
    loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.6.11').catch(function () {}).then(function () {
      if (!container.isConnected) return;
      container.querySelectorAll('[data-bunny-background-init]').forEach(function (player) {
        var src = player.getAttribute('data-player-src');
        if (!src) return;
        var video = player.querySelector('video');
        if (!video) return;

        try { video.pause(); } catch (_) {}
        try { video.removeAttribute('src'); video.load(); } catch (_) {}

        function setStatus(s) {
          if (player.getAttribute('data-player-status') !== s) player.setAttribute('data-player-status', s);
        }
        function setActivated(v) { player.setAttribute('data-player-activated', v ? 'true' : 'false'); }
        if (!player.hasAttribute('data-player-activated')) setActivated(false);

        var isLazyTrue = player.getAttribute('data-player-lazy') === 'true';
        var autoplay = player.getAttribute('data-player-autoplay') === 'true';
        var initialMuted = player.getAttribute('data-player-muted') === 'true';
        var pendingPlay = false;

        if (autoplay) { video.muted = true; video.loop = true; }
        else { video.muted = initialMuted; }

        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.playsInline = true;
        if (typeof video.disableRemotePlayback !== 'undefined') video.disableRemotePlayback = true;
        if (autoplay) video.autoplay = false;

        var isSafariNative = !!video.canPlayType('application/vnd.apple.mpegurl');
        var canUseHlsJs = !!(window.Hls && Hls.isSupported()) && !isSafariNative;

        var isAttached = false;
        var lastPauseBy = '';
        function attachMediaOnce() {
          if (isAttached) return;
          isAttached = true;
          if (player._hls) { try { player._hls.destroy(); } catch (_) {} player._hls = null; }
          if (isSafariNative) {
            video.preload = isLazyTrue ? 'none' : 'auto';
            video.src = src;
            video.addEventListener('loadedmetadata', function () { readyIfIdle(); }, { once: true });
          } else if (canUseHlsJs) {
            var hls = new Hls({ maxBufferLength: 10 });
            hls.attachMedia(video);
            hls.on(Hls.Events.MEDIA_ATTACHED, function () { hls.loadSource(src); });
            hls.on(Hls.Events.MANIFEST_PARSED, function () { readyIfIdle(); });
            player._hls = hls;
          } else {
            video.src = src;
          }
        }

        if (isLazyTrue) video.preload = 'none';
        else attachMediaOnce();

        function readyIfIdle() {
          if (!pendingPlay && player.getAttribute('data-player-activated') !== 'true' && player.getAttribute('data-player-status') === 'idle') {
            player.setAttribute('data-player-status', 'ready');
          }
        }
        function safePlay() {
          var p = video.play();
          if (p && typeof p.then === 'function') p.catch(function () {});
        }
        function togglePlay() {
          if (video.paused || video.ended) {
            if (isLazyTrue && !isAttached) attachMediaOnce();
            pendingPlay = true;
            lastPauseBy = '';
            setStatus('loading');
            safePlay();
          } else {
            lastPauseBy = 'manual';
            video.pause();
          }
        }
        function toggleMute() {
          video.muted = !video.muted;
          player.setAttribute('data-player-muted', video.muted ? 'true' : 'false');
        }

        player.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-player-control]');
          if (!btn || !player.contains(btn)) return;
          var type = btn.getAttribute('data-player-control');
          if (type === 'play' || type === 'pause' || type === 'playpause') togglePlay();
          else if (type === 'mute') toggleMute();
        });

        video.addEventListener('play', function () { setActivated(true); setStatus('playing'); });
        video.addEventListener('playing', function () { pendingPlay = false; setStatus('playing'); });
        video.addEventListener('pause', function () { pendingPlay = false; setStatus('paused'); });
        video.addEventListener('waiting', function () { setStatus('loading'); });
        video.addEventListener('canplay', function () { readyIfIdle(); });
        video.addEventListener('ended', function () { pendingPlay = false; setStatus('paused'); setActivated(false); });

        if (autoplay) {
          if (player._io) { try { player._io.disconnect(); } catch (_) {} }
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              var inView = entry.isIntersecting && entry.intersectionRatio > 0;
              if (inView) {
                if (isLazyTrue && !isAttached) attachMediaOnce();
                if (lastPauseBy === 'io' || (video.paused && lastPauseBy !== 'manual')) {
                  setStatus('loading');
                  if (video.paused) togglePlay();
                  lastPauseBy = '';
                }
              } else if (!video.paused && !video.ended) {
                lastPauseBy = 'io';
                video.pause();
              }
            });
          }, { threshold: 0.1 });
          io.observe(player);
          player._io = io;
        }

        onCleanup(function () {
          try { if (player._io) player._io.disconnect(); } catch (_) {}
          try { if (player._hls) player._hls.destroy(); } catch (_) {}
          try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
        });
      });
    });
  }

  // ---------- Services: directional fill + image cursor follower (Home) ----------
  function initServicesHover(container) {
    if (!hasGSAP) return;
    var BASE_COLOR = '#3c57a7';   // Primary Text Blue
    var ACTIVE_COLOR = '#fffef5'; // text on the blue fill
    var TEXT_SEL = '.service-project-name-heading, .service-number-text';
    var desktop = window.matchMedia('(hover: hover) and (min-width: 992px)');

    var wrap = container.querySelector('[data-follower-wrap]');
    if (!wrap) return;
    var collection = wrap.querySelector('[data-follower-collection]');
    var items = Array.prototype.slice.call(wrap.querySelectorAll('[data-follower-item]'));
    var follower = wrap.querySelector('[data-follower-cursor]');
    var followerInner = wrap.querySelector('[data-follower-cursor-inner]');
    var onMove = null;

    var ctx = gsap.context(function () {
      // Keep the fixed follower out of any transformed parent
      if (follower) document.body.appendChild(follower);

      // Directional hover: fill enters/exits from the edge the cursor crosses
      items.forEach(function (item) {
        gsap.set(item.querySelector('[data-directional-hover-tile]'), { scaleY: 0, transformOrigin: 'top center' });
        gsap.set(item.querySelectorAll(TEXT_SEL), { color: BASE_COLOR });
      });

      function getEdge(e, el) {
        var r = el.getBoundingClientRect();
        return (e.clientY - r.top) < r.height / 2 ? 'top' : 'bottom';
      }

      items.forEach(function (item) {
        var tile = item.querySelector('[data-directional-hover-tile]');
        var texts = item.querySelectorAll(TEXT_SEL);
        if (!tile) return;

        item.addEventListener('mouseenter', function (e) {
          if (!desktop.matches) return;
          var dir = getEdge(e, item);
          gsap.killTweensOf(tile);
          gsap.set(tile, { transformOrigin: dir + ' center' });
          gsap.to(tile, { scaleY: 1, duration: 0.45, ease: 'power3.out' });
          gsap.to(texts, { color: ACTIVE_COLOR, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
          item.setAttribute('data-status', 'enter-' + dir);
        });

        item.addEventListener('mouseleave', function (e) {
          if (!desktop.matches) return;
          var dir = getEdge(e, item);
          gsap.killTweensOf(tile);
          gsap.set(tile, { transformOrigin: dir + ' center' });
          gsap.to(tile, { scaleY: 0, duration: 0.4, ease: 'power2.inOut' });
          gsap.to(texts, { color: BASE_COLOR, duration: 0.35, ease: 'power2.inOut', overwrite: 'auto' });
          item.setAttribute('data-status', 'leave-' + dir);
        });
      });

      // Image preview cursor follower
      if (!follower || !followerInner || !collection) return;

      var prevIndex = null;
      var firstEntry = true;
      var offset = 100;
      var duration = 0.5;
      var ease = 'power2.inOut';

      gsap.set(follower, { xPercent: -50, yPercent: -50 });
      var xTo = gsap.quickTo(follower, 'x', { duration: 0.6, ease: 'power3' });
      var yTo = gsap.quickTo(follower, 'y', { duration: 0.6, ease: 'power3' });

      onMove = function (e) { xTo(e.clientX); yTo(e.clientY); };
      window.addEventListener('mousemove', onMove);

      items.forEach(function (item, index) {
        item.addEventListener('mouseenter', function () {
          if (!desktop.matches) return;
          var forward = prevIndex === null || index > prevIndex;
          prevIndex = index;

          follower.querySelectorAll('[data-follower-visual]').forEach(function (el) {
            gsap.killTweensOf(el);
            gsap.to(el, {
              yPercent: forward ? -offset : offset, duration: duration, ease: ease, overwrite: 'auto',
              onComplete: function () { el.remove(); }
            });
          });

          var visual = item.querySelector('[data-follower-visual]');
          if (!visual) return;
          var clone = visual.cloneNode(true);
          clone.removeAttribute('style');
          clone.removeAttribute('loading');
          followerInner.appendChild(clone);

          if (!firstEntry) {
            gsap.fromTo(clone, { yPercent: forward ? offset : -offset }, { yPercent: 0, duration: duration, ease: ease, overwrite: 'auto' });
          } else {
            firstEntry = false;
          }
        });

        item.addEventListener('mouseleave', function () {
          if (!desktop.matches) return;
          var el = follower.querySelector('[data-follower-visual]');
          if (!el) return;
          gsap.killTweensOf(el);
          gsap.to(el, { yPercent: -offset, duration: duration, ease: ease, overwrite: 'auto', onComplete: function () { el.remove(); } });
        });
      });

      collection.addEventListener('mouseleave', function () {
        follower.querySelectorAll('[data-follower-visual]').forEach(function (el) {
          gsap.killTweensOf(el);
          gsap.delayedCall(duration, function () { el.remove(); });
        });
        firstEntry = true;
        prevIndex = null;
      });
    }, container);

    onCleanup(function () {
      if (onMove) window.removeEventListener('mousemove', onMove);
      ctx.revert();
      if (follower && follower.parentNode === document.body) follower.remove();
    });
  }

  // ---------- Marquee with scroll direction (Home CSR) ----------
  function initMarqueeScrollDirection(container) {
    if (!hasGSAP || !hasST) return;
    var ctx = gsap.context(function () {
      container.querySelectorAll('[data-marquee-scroll-direction-target]').forEach(function (marquee) {
        var marqueeContent = marquee.querySelector('[data-marquee-collection-target]');
        var marqueeScroll = marquee.querySelector('[data-marquee-scroll-target]');
        if (!marqueeContent || !marqueeScroll) return;

        var d = marquee.dataset;
        var marqueeSpeedAttr = parseFloat(d.marqueeSpeed);
        var marqueeDirectionAttr = d.marqueeDirection === 'right' ? 1 : -1;
        var duplicateAmount = parseInt(d.marqueeDuplicate || 0, 10);
        var scrollSpeedAttr = parseFloat(d.marqueeScrollSpeed);
        var speedMultiplier = window.innerWidth < 479 ? 0.25 : window.innerWidth < 991 ? 0.5 : 1;
        var marqueeSpeed = marqueeSpeedAttr * (marqueeContent.offsetWidth / window.innerWidth) * speedMultiplier;

        marqueeScroll.style.marginLeft = (scrollSpeedAttr * -1) + '%';
        marqueeScroll.style.width = ((scrollSpeedAttr * 2) + 100) + '%';

        if (duplicateAmount > 0 && !marquee._duplicated) {
          var fragment = document.createDocumentFragment();
          for (var i = 0; i < duplicateAmount; i++) {
            var clone = marqueeContent.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            fragment.appendChild(clone);
          }
          marqueeScroll.appendChild(fragment);
          marquee._duplicated = true;
        }

        var marqueeItems = marquee.querySelectorAll('[data-marquee-collection-target]');
        var animation = gsap.to(marqueeItems, { xPercent: -100, repeat: -1, duration: marqueeSpeed, ease: 'linear' }).totalProgress(0.5);
        gsap.set(marqueeItems, { xPercent: marqueeDirectionAttr === 1 ? 100 : -100 });
        animation.timeScale(marqueeDirectionAttr);
        animation.play();
        marquee.setAttribute('data-marquee-status', 'normal');

        ScrollTrigger.create({
          trigger: marquee,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: function (self) {
            var isInverted = self.direction === 1;
            animation.timeScale(isInverted ? -marqueeDirectionAttr : marqueeDirectionAttr);
            marquee.setAttribute('data-marquee-status', isInverted ? 'normal' : 'inverted');
          }
        });

        var tl = gsap.timeline({ scrollTrigger: { trigger: marquee, start: '0% 100%', end: '100% 0%', scrub: 0 } });
        var scrollStart = marqueeDirectionAttr === -1 ? scrollSpeedAttr : -scrollSpeedAttr;
        tl.fromTo(marqueeScroll, { x: scrollStart + 'vw' }, { x: (-scrollStart) + 'vw', ease: 'none' });
      });
    }, container);
    onCleanup(function () { ctx.revert(); });
  }

  // ---------- Number counters [wf-counter="true"] (Home, About, Services) ----------
  function initCounters(container) {
    var observers = [];
    container.querySelectorAll('[wf-counter="true"]').forEach(function (counter) {
      var startNumber = parseInt(counter.getAttribute('wf-start-number'), 10) || 0;
      var text = counter.textContent.trim();
      var endNumber = parseInt(counter.getAttribute('wf-end-number'), 10);
      if (isNaN(parseInt(text, 10))) endNumber = endNumber || null;
      else endNumber = endNumber || parseInt(text, 10);
      var duration = parseFloat(counter.getAttribute('wf-duration')) * 1000 || 2000;
      if (endNumber === null) return;

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          animateCounter(counter, startNumber, endNumber, duration);
          observer.unobserve(entry.target);
        });
      });
      observer.observe(counter);
      observers.push(observer);
    });

    function animateCounter(counter, start, end, duration) {
      var startTime = null;
      function countUp(now) {
        if (!counter.isConnected) return;
        if (!startTime) startTime = now;
        var progress = Math.min((now - startTime) / duration, 1);
        counter.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) requestAnimationFrame(countUp);
      }
      requestAnimationFrame(countUp);
    }

    onCleanup(function () { observers.forEach(function (o) { o.disconnect(); }); });
  }

  // ---------- Step-by-step timeline (About) ----------
  function initStepByStepTimeline(container) {
    if (!hasGSAP) return;
    var root = container.querySelector('[data-step-timeline-init]');
    if (!root) return;
    var line = root.querySelector('[data-step-timeline-line]');
    var fill = root.querySelector('[data-step-timeline-fill]');
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-step-timeline-item]'));
    if (!line || !fill || !items.length) return;

    if (typeof root._stepTimelineCleanup === 'function') root._stepTimelineCleanup();

    var anchors = items.map(function (item) { return item.querySelector('[data-step-timeline-marker]') || item; });
    var activationInput = parseFloat(root.dataset.stepTimelineActivation);
    var activation = isNaN(activationInput) ? 0.5 : Math.min(Math.max(activationInput, 0), 1);
    var currentIndex = -2;
    var frameRequested = false;
    var destroyed = false;
    var unsubscribeLenis = null;

    function setCurrentIndex(index) {
      if (index === currentIndex) return;
      currentIndex = index;
      items.forEach(function (item, i) {
        item.setAttribute('data-status', index >= 0 && i <= index ? 'active' : 'inactive');
        item.toggleAttribute('data-current', i === index);
        item.toggleAttribute('data-previous', i === index - 1);
        item.toggleAttribute('data-next', i === index + 1);
      });
    }

    function updateTimeline() {
      frameRequested = false;
      if (destroyed) return;
      var parent = line.parentElement;
      if (!parent) return;
      var parentRect = parent.getBoundingClientRect();
      var centers = anchors.map(function (anchor) {
        var rect = anchor.getBoundingClientRect();
        return { viewport: rect.top + rect.height / 2, relative: rect.top + rect.height / 2 - parentRect.top };
      });
      var first = centers[0];
      var last = centers[centers.length - 1];
      var span = Math.max(last.relative - first.relative, 0);
      line.style.top = first.relative + 'px';
      line.style.height = span + 'px';

      if (reducedMotion) {
        gsap.set(fill, { transformOrigin: 'top', scaleY: 1 });
        setCurrentIndex(items.length - 1);
        return;
      }

      var activationPoint = window.innerHeight * activation;
      var progress = span > 0
        ? gsap.utils.clamp(0, 1, (activationPoint - first.viewport) / span)
        : (activationPoint >= first.viewport ? 1 : 0);
      gsap.set(fill, { transformOrigin: 'top', scaleY: progress });

      var activeIndex = -1;
      centers.forEach(function (center, index) { if (center.viewport <= activationPoint) activeIndex = index; });
      setCurrentIndex(activeIndex);
    }

    function scheduleUpdate() {
      if (destroyed || frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(updateTimeline);
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    if (lenis && typeof lenis.on === 'function') {
      var unsub = lenis.on('scroll', scheduleUpdate);
      if (typeof unsub === 'function') unsubscribeLenis = unsub;
    }

    var resizeObserver = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      items.forEach(function (item) { resizeObserver.observe(item); });
    }

    var images = Array.prototype.slice.call(root.querySelectorAll('img'));
    images.forEach(function (image) {
      image.addEventListener('load', scheduleUpdate);
      image.addEventListener('error', scheduleUpdate);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleUpdate);

    var delayedUpdates = [300, 1000, 2500, 3500].map(function (ms) { return setTimeout(scheduleUpdate, ms); });

    setCurrentIndex(-1);
    gsap.set(fill, { transformOrigin: 'top', scaleY: 0 });
    scheduleUpdate();

    root._stepTimelineCleanup = function () {
      destroyed = true;
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (unsubscribeLenis) unsubscribeLenis();
      if (resizeObserver) resizeObserver.disconnect();
      images.forEach(function (image) {
        image.removeEventListener('load', scheduleUpdate);
        image.removeEventListener('error', scheduleUpdate);
      });
      delayedUpdates.forEach(clearTimeout);
    };
    onCleanup(root._stepTimelineCleanup);
  }

  // ---------- Tinyflow slider (About) ----------
  function initTinyflowSlider(container) {
    var sliders = [];
    var cancelled = false;
    onCleanup(function () {
      cancelled = true;
      sliders.forEach(function (s) { try { s.destroy(true, true); } catch (e) {} });
    });
    loadScript('https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js').then(function () {
      if (cancelled || !container.isConnected || typeof window.Swiper === 'undefined') return;
      container.querySelectorAll('.tinyflow-slider').forEach(function (el) {
        sliders.push(new Swiper(el, {
          rewind: true,
          autoHeight: true,
          effect: 'fade',
          keyboard: { enabled: true },
          pagination: { el: '.slider-pagination', type: 'progressbar' },
          navigation: { prevEl: '[data-arrow="prev"]', nextEl: '[data-arrow="next"]' }
        }));
      });
    }).catch(function (e) { console.warn('[mcsl] swiper failed to load', e); });
  }

  // ---------- Sticky service panels (Services) ----------
  function initStickyPanels(container) {
    if (!hasGSAP || !hasST) return;
    var ctx = gsap.context(function () {
      var panels = container.querySelectorAll('.sticky-section_panel');
      panels.forEach(function (panel, index) {
        var isLast = index === panels.length - 1;
        gsap.timeline({ scrollTrigger: { trigger: panel, start: 'top top', scrub: 1 } })
          .to(panel, {
            ease: 'none',
            startAt: { filter: 'brightness(100%) blur(0px)' },
            filter: isLast ? 'none' : 'brightness(50%) blur(5px)',
            scale: 0.9,
            borderRadius: 40
          }, '<');
      });
    }, container);
    onCleanup(function () { ctx.revert(); });
  }

  // ---------- Footer parallax (Osmo) ----------
  // [data-footer-parallax] wrapper (overflow hidden) holds
  // [data-footer-parallax-inner] (the footer) and [data-footer-parallax-dark]
  // (overlay). The footer rises from FOOTER_SHIFT to rest and the overlay
  // fades out while the footer scrolls into view, so it looks like it was
  // underneath the page. Lives in the Footer MCSL component.
  function initFooterParallax(container) {
    if (!hasGSAP || !hasST || reducedMotion) return;
    var ctx = gsap.context(function () {
      container.querySelectorAll('[data-footer-parallax]').forEach(function (el) {
        var inner = el.querySelector('[data-footer-parallax-inner]');
        var dark = el.querySelector('[data-footer-parallax-dark]');
        var tl = gsap.timeline({
          scrollTrigger: { trigger: el, start: 'clamp(top bottom)', end: 'clamp(top top)', scrub: true }
        });
        if (inner) tl.from(inner, { yPercent: FOOTER_SHIFT, ease: 'none' });
        if (dark) tl.from(dark, { opacity: PARALLAX_DARK, ease: 'none' }, '<');
      });
    }, container);
    onCleanup(function () { ctx.revert(); });
  }

  // ---------- Hero parallax ----------
  // The footer effect in reverse: [data-hero-parallax-inner] drifts down
  // by HERO_SHIFT and [data-hero-parallax-dark] fades in while the hero
  // scrolls away, so the next section reads as covering it.
  function initHeroParallax(container) {
    if (!hasGSAP || !hasST || reducedMotion) return;
    var ctx = gsap.context(function () {
      container.querySelectorAll('[data-hero-parallax]').forEach(function (el) {
        var inner = el.querySelector('[data-hero-parallax-inner]');
        var dark = el.querySelector('[data-hero-parallax-dark]');
        var tl = gsap.timeline({
          scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true }
        });
        if (inner) tl.to(inner, { yPercent: HERO_SHIFT, ease: 'none' });
        if (dark) tl.to(dark, { opacity: PARALLAX_DARK, ease: 'none' }, '<');
      });
    }, container);
    onCleanup(function () { ctx.revert(); });
  }

  // ---------- Footer water ripples ----------
  // WebGL effect, so it only starts when the footer is about to come into
  // view and pauses when it leaves (otherwise it freezes the browser right
  // after every page change and redraws forever). Mouse-driven, so it is
  // skipped on touch devices and for reduced motion.
  function initFooterRipples(container) {
    var $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.ripples || reducedMotion) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var footers = Array.prototype.slice.call(container.querySelectorAll('.mcsl-footer'));
    if (!footers.length || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var $f = $(entry.target);
        var running = !!$f.data('ripples');
        if (entry.isIntersecting) {
          if (!running) {
            try { $f.ripples({ resolution: 512, dropRadius: 15, perturbance: 0.004 }); }
            catch (e) { io.unobserve(entry.target); }
          } else {
            try { $f.ripples('play'); } catch (e) {}
          }
        } else if (running) {
          try { $f.ripples('pause'); } catch (e) {}
        }
      });
    }, { rootMargin: '300px 0px' });

    footers.forEach(function (f) { io.observe(f); });
    onCleanup(function () {
      io.disconnect();
      footers.forEach(function (f) { try { if ($(f).data('ripples')) $(f).ripples('destroy'); } catch (e) {} });
    });
  }

  // ---------- Elements reveal on scroll (Osmo) ----------
  // Same attributes and behaviour as Osmo's "Elements Reveal on Scroll":
  // [data-reveal-group], [data-reveal-group-nested], [data-stagger] (ms),
  // [data-distance], [data-start], [data-ignore="true"/"false"].
  // Barba changes: hidden states are applied while the page is covered,
  // and the ScrollTriggers are armed when the cover starts lifting, so
  // above-the-fold content animates in as the page appears. A group that
  // sits inside another group runs on its own trigger (the outer one
  // skips it), and only the reveal's own properties are cleared after.
  var pendingReveals = [];
  var runningReveals = [];
  // Finish any reveal still animating (used when the transition watchdog
  // had to force the cover off, so content never sits invisible)
  function flushReveals() {
    var tls = runningReveals || [];
    runningReveals = [];
    tls.forEach(function (tl) { try { tl.progress(1); } catch (e) {} });
  }
  function armReveals() {
    var fns = pendingReveals;
    pendingReveals = [];
    if (!fns.length) return;
    fns.forEach(function (fn) { safe('reveal', fn); });
    refreshScroll();
  }

  function initContentRevealScroll(container) {
    if (!hasGSAP || !hasST || reducedMotion) return;
    var CLEAR = 'transform,opacity,visibility';
    var animDuration = 0.8;
    var animEase = 'power4.inOut';
    var arms = [];

    function isOwnGroup(el) {
      return el.matches('[data-reveal-group]') || !!el.querySelector('[data-reveal-group]');
    }

    var ctx = gsap.context(function () {
      container.querySelectorAll('[data-reveal-group]').forEach(function (groupEl) {
        var groupStaggerSec = (parseFloat(groupEl.getAttribute('data-stagger')) || 100) / 1000;
        var groupDistance = groupEl.getAttribute('data-distance') || '2em';
        var triggerStart = groupEl.getAttribute('data-start') || 'top 80%';

        var directChildren = Array.prototype.filter.call(groupEl.children, function (el) {
          return el.nodeType === 1 && !isOwnGroup(el);
        });

        if (!directChildren.length) {
          if (groupEl.querySelector('[data-reveal-group]')) return; // only nested groups inside
          gsap.set(groupEl, { y: groupDistance, autoAlpha: 0 });
          arms.push(function () {
            ScrollTrigger.create({
              trigger: groupEl,
              start: triggerStart,
              once: true,
              onEnter: function () {
                runningReveals.push(gsap.to(groupEl, {
                  y: 0, autoAlpha: 1, duration: animDuration, ease: animEase,
                  onComplete: function () { gsap.set(groupEl, { clearProps: CLEAR }); }
                }));
              }
            });
          });
          return;
        }

        var slots = [];
        directChildren.forEach(function (child) {
          var nestedGroup = child.matches('[data-reveal-group-nested]')
            ? child
            : child.querySelector(':scope [data-reveal-group-nested]');

          if (nestedGroup) {
            var includeParent = child.getAttribute('data-ignore') !== 'true' && (
              child.getAttribute('data-ignore') === 'false' ||
              nestedGroup.getAttribute('data-ignore') === 'false'
            );
            var nestedChildren = Array.prototype.filter.call(nestedGroup.children, function (el) {
              return el.nodeType === 1 && el.getAttribute('data-ignore') !== 'true';
            });
            slots.push({ type: 'nested', parentEl: child, nestedEl: nestedGroup, includeParent: includeParent, nestedChildren: nestedChildren });
          } else {
            if (child.getAttribute('data-ignore') === 'true') return;
            slots.push({ type: 'item', el: child });
          }
        });

        slots.forEach(function (slot) {
          if (slot.type === 'item') {
            var isNestedSelf = slot.el.matches('[data-reveal-group-nested]');
            var distance = isNestedSelf ? groupDistance : slot.el.getAttribute('data-distance') || groupDistance;
            gsap.set(slot.el, { y: distance, autoAlpha: 0 });
          } else {
            if (slot.includeParent) gsap.set(slot.parentEl, { y: groupDistance, autoAlpha: 0 });
            var nestedDistance = slot.nestedEl.getAttribute('data-distance') || groupDistance;
            slot.nestedChildren.forEach(function (target) { gsap.set(target, { y: nestedDistance, autoAlpha: 0 }); });
          }
        });

        arms.push(function () {
          ScrollTrigger.create({
            trigger: groupEl,
            start: triggerStart,
            once: true,
            onEnter: function () {
              var tl = gsap.timeline({ onComplete: function () { runningReveals = runningReveals.filter(function (x) { return x !== tl; }); } });
              runningReveals.push(tl);
              slots.forEach(function (slot, slotIndex) {
                var slotTime = slotIndex * groupStaggerSec;
                if (slot.type === 'item') {
                  tl.to(slot.el, {
                    y: 0, autoAlpha: 1, duration: animDuration, ease: animEase,
                    onComplete: function () { gsap.set(slot.el, { clearProps: CLEAR }); }
                  }, slotTime);
                } else {
                  if (slot.includeParent) {
                    tl.to(slot.parentEl, {
                      y: 0, autoAlpha: 1, duration: animDuration, ease: animEase,
                      onComplete: function () { gsap.set(slot.parentEl, { clearProps: CLEAR }); }
                    }, slotTime);
                  }
                  var nestedMs = parseFloat(slot.nestedEl.getAttribute('data-stagger'));
                  var nestedStaggerSec = isNaN(nestedMs) ? groupStaggerSec : nestedMs / 1000;
                  slot.nestedChildren.forEach(function (nestedChild, nestedIndex) {
                    tl.to(nestedChild, {
                      y: 0, autoAlpha: 1, duration: animDuration, ease: animEase,
                      onComplete: function () { gsap.set(nestedChild, { clearProps: CLEAR }); }
                    }, slotTime + nestedIndex * nestedStaggerSec);
                  });
                }
              });
            }
          });
        });
      });
    }, container);

    arms.forEach(function (arm) { pendingReveals.push(function () { ctx.add(arm); }); });
    onCleanup(function () { pendingReveals = []; runningReveals = []; ctx.revert(); });
  }

  // ---------- Registry ----------
  function initPageFunctions(container) {
    container = container || document;
    // Barba runs the beforeEnter hook on the first load as well as `once`,
    // so the same container can arrive twice. Set each one up only once.
    if (container._mcslInit) return;
    container._mcslInit = true;
    var has = function (s) { return !!container.querySelector(s); };

    if (has('[data-bunny-background-init]')) safe('bunny video', function () { initBunnyPlayerBackground(container); });
    if (has('[data-follower-wrap]')) safe('services hover', function () { initServicesHover(container); });
    if (has('[data-marquee-scroll-direction-target]')) safe('marquee', function () { initMarqueeScrollDirection(container); });
    if (has('[wf-counter="true"]')) safe('counters', function () { initCounters(container); });
    if (has('[data-step-timeline-init]')) safe('timeline', function () { initStepByStepTimeline(container); });
    if (has('.tinyflow-slider')) safe('slider', function () { initTinyflowSlider(container); });
    if (has('.sticky-section_panel')) safe('sticky panels', function () { initStickyPanels(container); });
    if (has('[data-hero-parallax]')) safe('hero parallax', function () { initHeroParallax(container); });
    if (has('[data-footer-parallax]')) safe('footer parallax', function () { initFooterParallax(container); });
    if (has('.mcsl-footer')) safe('footer ripples', function () { initFooterRipples(container); });
    if (has('[data-reveal-group]')) safe('reveal on scroll', function () { initContentRevealScroll(container); });
  }

  // =========================================================
  // BARBA
  // =========================================================
  function samePath(href) {
    try {
      var url = new URL(href, window.location.href);
      return url.origin === window.location.origin && url.pathname.replace(/\/$/, '') === window.location.pathname.replace(/\/$/, '');
    } catch (e) { return false; }
  }

  // Smooth-scroll to an element with Lenis. Checks the position again when
  // it lands, in case images or pinned sections above changed the layout.
  function scrollToElement(target) {
    if (!lenis) { target.scrollIntoView({ behavior: 'smooth' }); return; }
    lenis.scrollTo(target, {
      duration: 1.2,
      easing: function (x) { return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; },
      onComplete: function () {
        if (Math.abs(target.getBoundingClientRect().top) > 4) lenis.scrollTo(target, { duration: 0.5 });
      }
    });
  }

  // Same-page links. Runs before Webflow's own jQuery anchor scrolling
  // (which fights Lenis and stops short) and before Barba.
  //  - "#section" (or this page's URL + #section): smooth-scroll to it
  //  - this page's URL without a hash: smooth-scroll to the top
  function initSamePageLinks() {
    window.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var raw = a.getAttribute('href') || '';
      if (raw === '#' || raw === '') return;
      if (!samePath(a.href)) return;
      var hash = a.hash;
      if (hash && hash.length > 1) {
        var target = null;
        try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (err) {}
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        Nav.close();
        scrollToElement(target);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (lenis) lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, true);
  }

  function initBarba() {
    history.scrollRestoration = 'manual';
    initSamePageLinks();

    barba.hooks.beforeLeave(function () {
      Nav.close();
      if (lenis) lenis.stop();
    });

    barba.hooks.afterLeave(function () {
      runPageCleanups();
      if (hasST) ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    });

    barba.hooks.beforeEnter(function (data) {
      return reinitWebflow(data.next.html).then(function () {
        scrollToTop();
        Nav.updateCurrent(data.next.html);
        initPageFunctions(data.next.container);
        Nav.resetHide();
        Nav.refreshTheme();
        refreshScroll();
      });
    });

    barba.hooks.afterEnter(function () {
      if (lenis) { lenis.resize(); lenis.start(); }
      scrollToHash();
      refreshScroll();
      Nav.refreshTheme();
    });

    barba.init({
      debug: false,
      timeout: 7000,
      preventRunning: true,
      prevent: function (args) {
        var el = args.el;
        if (!el) return false;
        if (el.closest('[data-barba-prevent]')) return true;
        var raw = el.getAttribute('href') || '';
        if (raw.charAt(0) === '#') return true;
        if (samePath(el.href)) return true; // handled by initSamePageLinks / anchors
        if (/\.(pdf|zip|docx?|xlsx?|pptx?|csv|png|jpe?g|webp|gif|svg|mp4|mov)(\?|$)/i.test(args.href || '')) return true;
        return false;
      },
      // A page that can't be fetched (404 etc.) loads normally
      requestError: function (trigger, action, url) {
        if (action === 'click' || action === 'popstate') window.location.href = url;
        return false;
      },
      transitions: [{
        name: 'mcsl-lottie',
        once: function (data) {
          if (lenis) lenis.stop();
          initPageFunctions(data.next.container);
          // Not awaited: Barba is free to navigate while the first
          // reveal plays, so an early click never forces a hard reload.
          // If the visitor navigates before it ends, afterEnter restarts Lenis.
          Transition.reveal(FIRST_LOAD_WAIT, armReveals).then(function () { if (lenis) lenis.start(); });
        },
        // Remove the old page as soon as it's covered, so the new page is
        // the only container when Webflow re-inits and the reveal plays.
        leave: function (data) {
          return Transition.cover().then(function () {
            if (data.current.container) data.current.container.remove();
          });
        },
        enter: function () { return Transition.reveal(null, armReveals); }
      }]
    });
  }

  // =========================================================
  // BOOT
  // =========================================================
  function boot() {
    initLenis();
    watchPageHeight();
    Nav.init();

    var canUseBarba = !isEditor &&
      typeof window.barba !== 'undefined' &&
      !!document.querySelector('[data-barba="wrapper"] [data-barba="container"]');

    if (canUseBarba) {
      initBarba();
    } else {
      // Editor, utility pages, or Barba failed to load: run the page normally
      initPageFunctions(document);
      if (isEditor) { Transition.hide(); armReveals(); }
      else Transition.reveal(null, armReveals);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
