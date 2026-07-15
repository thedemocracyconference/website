(function () {
  var HEADER_SELECTOR = '.framer-1kfysrm-container';
  var SECTION_IDS = ['about', 'salons', 'agenda', 'participate'];

  function pinHeader(header) {
    // Fixed positioning itself is a static CSS rule now (sticky-nav.css) --
    // this only needs to hide/show the header at the two discrete moments
    // the Join Us modal opens/closes. Toggling a class (rather than setting
    // inline styles) is required here so it can out-specificity the
    // unconditional "visibility: visible !important" sticky rule.
    return {
      hide: function () {
        header.classList.add('demcon-header-hidden');
      },
      show: function () {
        header.classList.remove('demcon-header-hidden');
      }
    };
  }

  function watchHeaderContrast(header, getHeaderHeight) {
    function parseColor(str) {
      var m = str && str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      var parts = m[1].split(',').map(function (n) {
        return parseFloat(n);
      });
      var alpha = parts.length > 3 ? parts[3] : 1;
      return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
    }

    var sampleCanvas = document.createElement('canvas');
    var sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    function sampleMediaPixel(media, x, y) {
      try {
        var rect = media.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        var w = media.naturalWidth || media.videoWidth || rect.width;
        var h = media.naturalHeight || media.videoHeight || rect.height;
        if (!w || !h) return null;
        sampleCanvas.width = w;
        sampleCanvas.height = h;
        sampleCtx.drawImage(media, 0, 0, w, h);
        var relX = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
        var relY = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
        var data = sampleCtx.getImageData(Math.round(relX * (w - 1)), Math.round(relY * (h - 1)), 1, 1).data;
        return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
      } catch (e) {
        return null;
      }
    }

    function findBackgroundColor(x, y) {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i++) {
        var el = stack[i];
        if (header.contains(el)) continue;
        if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
          var pixel = sampleMediaPixel(el, x, y);
          if (pixel && pixel.a > 0.5) return pixel;
        }
        var color = parseColor(getComputedStyle(el).backgroundColor);
        if (color && color.a > 0.5) return color;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }

    // Averaging several points across the width smooths out small decorative
    // details (icons, line art) that would otherwise cause a single stray
    // dark/light pixel to misclassify the whole section.
    var SAMPLE_FRACTIONS = [0.15, 0.3, 0.5, 0.7, 0.85];

    function averageBackgroundColor(y) {
      var total = { r: 0, g: 0, b: 0 };
      var count = 0;
      SAMPLE_FRACTIONS.forEach(function (f) {
        var color = findBackgroundColor(Math.round(window.innerWidth * f), y);
        total.r += color.r;
        total.g += color.g;
        total.b += color.b;
        count++;
      });
      return { r: total.r / count, g: total.g / count, b: total.b / count };
    }

    var SWATCHES = {
      yellow: { r: 255, g: 245, b: 0 },
      white: { r: 250, g: 249, b: 245 },
      black: { r: 3, g: 5, b: 9 }
    };
    var BUCKET_CLASSES = ['demcon-nav-yellow', 'demcon-nav-white', 'demcon-nav-black'];

    function nearestBucket(color) {
      var best = null;
      var bestDist = Infinity;
      Object.keys(SWATCHES).forEach(function (name) {
        var s = SWATCHES[name];
        var dist = Math.pow(color.r - s.r, 2) + Math.pow(color.g - s.g, 2) + Math.pow(color.b - s.b, 2);
        if (dist < bestDist) {
          bestDist = dist;
          best = name;
        }
      });
      return best;
    }

    // Card grids mix light/dark photos or cards over one solid section
    // background; forcing the section's actual background color avoids the
    // navbar flickering as it passes over individual cards.
    var FORCED_SECTIONS = [{ selector: '[data-framer-name="Participation"]', bucket: 'black' }];

    function forcedBucket(y) {
      for (var i = 0; i < FORCED_SECTIONS.length; i++) {
        var el = document.querySelector(FORCED_SECTIONS[i].selector);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) return FORCED_SECTIONS[i].bucket;
      }
      return null;
    }

    var currentBucket = null;
    var pendingBucket = null;
    var pendingStreak = 0;

    function applyBucket(bucket) {
      if (bucket === currentBucket) {
        pendingBucket = null;
        pendingStreak = 0;
        return;
      }
      if (bucket === pendingBucket) {
        pendingStreak++;
      } else {
        pendingBucket = bucket;
        pendingStreak = 1;
      }
      // Require two consecutive matching reads before switching, so a single
      // stray sample (e.g. landing on a decorative icon) can't cause a flicker.
      if (pendingStreak < 2) return;
      currentBucket = bucket;
      pendingBucket = null;
      pendingStreak = 0;
      BUCKET_CLASSES.forEach(function (cls) {
        header.classList.toggle(cls, cls === 'demcon-nav-' + bucket);
      });
    }

    function check() {
      var y = Math.round(getHeaderHeight() + 4);
      var bucket = forcedBucket(y) || nearestBucket(averageBackgroundColor(y));
      applyBucket(bucket);
    }

    // A single sample point can land on a decorative line-art pixel (the
    // scattered star/sparkle icons in the hero, for instance) and, since
    // only 2 consecutive matching reads are required to switch buckets, a
    // couple of unlucky reads right at load can latch onto the wrong bucket
    // with nothing to self-correct it until the next scroll/resize. Run a
    // short, bounded burst of checks (not an infinite poll) so a stray bad
    // sample gets outvoted by the many good ones. Also re-run this burst
    // whenever the Join Us modal closes: its full-viewport backdrop sits
    // over the sample point while open, so a check firing during that
    // window can misclassify the header as black until re-sampled.
    //
    // Uses setTimeout rather than requestAnimationFrame -- rAF callbacks
    // proved unreliable in testing (queued but silently never firing),
    // which would leave the header permanently uncolored. The very first
    // check() below runs synchronously so there's a correct color even if
    // every subsequent timer somehow never fires.
    var warmupToken = 0;
    function warmup() {
      var token = ++warmupToken;
      var i = 0;
      (function step() {
        if (token !== warmupToken) return;
        check();
        i++;
        if (i < 10) setTimeout(step, 50);
      })();
    }
    check();
    warmup();

    // check() draws to a canvas and reads pixels back, which isn't free --
    // throttle rapid-fire scroll/resize events with a plain timestamp check
    // rather than requestAnimationFrame (unreliable here -- see above).
    var lastCheck = 0;
    function queueCheck() {
      var now = Date.now();
      if (now - lastCheck < 100) return;
      lastCheck = now;
      check();
    }
    window.addEventListener('scroll', queueCheck, { passive: true });
    window.addEventListener('resize', queueCheck, { passive: true });

    return { check: check, warmup: warmup };
  }

  function initScrollSpy(header, getHeaderHeight) {
    function linkHash(link) {
      var href = link.getAttribute('href');
      if (!href) return null;
      try {
        return new URL(href, window.location.href).hash.replace('#', '');
      } catch (e) {
        return null;
      }
    }

    function currentLinks() {
      return Array.prototype.slice.call(header.querySelectorAll('a.framer-YmthU'));
    }

    // Cross-page links (e.g. Contact) get a permanent underline when they point at the current page.
    currentLinks().forEach(function (link) {
      if (link.hasAttribute('data-framer-page-link-current')) {
        link.classList.add('demcon-nav-active');
      }
    });

    // "participate" has no real id in the DOM.
    var SECTION_SELECTOR_OVERRIDES = { participate: '[data-framer-name="Participation"]' };

    function findSectionEl(id) {
      var selector = SECTION_SELECTOR_OVERRIDES[id];
      return selector ? document.querySelector(selector) : document.getElementById(id);
    }

    var sections = [];
    SECTION_IDS.forEach(function (id) {
      var el = findSectionEl(id);
      if (!el) return;
      sections.push({ id: id, el: el });
    });

    if (!sections.length) return;

    var sectionsById = {};
    sections.forEach(function (s) {
      sectionsById[s.id] = s;
    });

    var currentActiveId = null;

    function applyActiveState() {
      currentLinks().forEach(function (link) {
        var isActive = currentActiveId !== null && linkHash(link) === currentActiveId;
        link.classList.toggle('demcon-nav-active', isActive);
      });
    }

    function setActive(id) {
      currentActiveId = id;
      applyActiveState();
    }

    header.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a.framer-YmthU');
      if (!link) return;
      var id = linkHash(link);
      var s = id && sectionsById[id];
      if (!s) return;
      e.preventDefault();
      setActive(id);
      var top = s.el.getBoundingClientRect().top + window.pageYOffset - getHeaderHeight() - 8;
      window.scrollTo({ top: top, behavior: 'smooth' });
      if (history.pushState) history.pushState(null, '', '#' + id);
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var match = sections.filter(function (s) {
              return s.el === entry.target;
            })[0];
            if (match) setActive(match.id);
          }
        });
      },
      { rootMargin: '-' + Math.round(getHeaderHeight() + 8) + 'px 0px -60% 0px', threshold: 0 }
    );

    sections.forEach(function (s) {
      observer.observe(s.el);
    });
  }

  // Mobile hamburger menu. The static export only baked in the Desktop nav
  // variant (Framer's runtime used to swap in a separate Mobile variant at
  // hydration time, which no longer runs), so there's no hamburger button or
  // mobile menu markup to work with at all -- this builds one from scratch,
  // reusing the existing desktop link row and "JOIN US" button as the
  // dropdown's content instead of duplicating them.
  function initMobileMenu(header) {
    var buttonArea = header.querySelector('.framer-qf0vfz');
    var menuList = header.querySelector('.framer-1ce9b2z');
    if (!buttonArea || !menuList) return;

    var HAMBURGER_ICON =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#030509" stroke-width="2" stroke-linecap="round">' +
      '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' +
      '</svg>';
    var CLOSE_ICON =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#030509" stroke-width="2" stroke-linecap="round">' +
      '<line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>' +
      '</svg>';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'demcon-mobile-menu-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = HAMBURGER_ICON;
    buttonArea.appendChild(toggle);

    function isOpen() {
      return header.classList.contains('demcon-mobile-menu-open');
    }

    function close() {
      header.classList.remove('demcon-mobile-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Menu');
      toggle.innerHTML = HAMBURGER_ICON;
    }

    function open() {
      header.classList.add('demcon-mobile-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      toggle.innerHTML = CLOSE_ICON;
      // getBoundingClientRect() forces a synchronous layout, so these reads
      // are accurate immediately after the class toggle above -- no need to
      // wait a frame.
      var headerRect = (header.querySelector('nav') || header).getBoundingClientRect();
      menuList.style.top = headerRect.bottom + 'px';
      var linksRect = menuList.getBoundingClientRect();
      var buttonWrap = buttonArea.querySelector('.framer-fp7wp4-container');
      if (buttonWrap) buttonWrap.style.top = linksRect.bottom + 'px';
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) close();
      else open();
    });

    menuList.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  function initJoinUsModal(header, headerVisibility, headerContrast) {
    var modal = document.getElementById('demcon-joinus-modal');
    var trigger = header.querySelector('[data-framer-name="Navbar Button"]');
    if (!modal || !trigger) return;

    var dialog = modal.querySelector('.demcon-modal-dialog');
    var firstField = modal.querySelector('input');
    var focusableSelector = 'input, button, [href], [tabindex]:not([tabindex="-1"])';
    var lastFocused = null;

    function isOpen() {
      return !modal.hidden;
    }

    function open() {
      lastFocused = document.activeElement;
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      headerVisibility.hide();
      if (firstField) firstField.focus();
    }

    function close() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      headerVisibility.show();
      // The modal's full-viewport backdrop sits right over the header's
      // color-sample point while open; re-run the warm-up burst now that
      // it's gone, in case a check happened to fire during that window.
      headerContrast.warmup();
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });

    modal.querySelectorAll('[data-modal-dismiss]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(dialog.querySelectorAll(focusableSelector));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function init() {
    var header = document.querySelector(HEADER_SELECTOR);
    if (!header) return;
    var nav = header.querySelector('nav');

    // The wrapper sizes itself from its in-flow child; the nav is pinned to
    // position:fixed (sticky-nav.css) and taken out of flow, so measure the
    // nav for real dimensions rather than the wrapper.
    function getHeaderHeight() {
      return (nav || header).getBoundingClientRect().height;
    }

    var headerVisibility = pinHeader(header);
    var headerContrast = watchHeaderContrast(header, getHeaderHeight);
    initScrollSpy(header, getHeaderHeight);
    initJoinUsModal(header, headerVisibility, headerContrast);
    initMobileMenu(header);
  }

  // Add a "Read more" link under the About paragraph, scrolling down to the
  // movement gallery that already sits right below it. Plain DOM insertion
  // (not a Framer component), so it's naturally responsive on mobile/desktop.
  function addReadMoreLink() {
    var paragraphs = document.querySelectorAll('.framer-fobxvj p');
    var target = null;
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].textContent.indexOf('DemCon brings together') !== -1) {
        target = paragraphs[i];
        break;
      }
    }
    if (!target) return;

    var wrapper = target.closest('.framer-fobxvj');
    if (!wrapper || wrapper.querySelector('.demcon-read-more')) return;

    var link = document.createElement('a');
    link.href = '#';
    link.className = 'demcon-read-more';
    link.textContent = 'READ MORE';
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var gallery = document.querySelector('[data-framer-name="Gallery"]');
      if (!gallery) return;
      var header = document.querySelector(HEADER_SELECTOR);
      var headerHeight = header ? header.getBoundingClientRect().height : 0;
      var top = gallery.getBoundingClientRect().top + window.pageYOffset - headerHeight - 24;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });

    wrapper.appendChild(link);
  }

  function setupHeroSubscribeButton() {
    var bubble = document.createElement('div');
    bubble.className = 'demcon-subscribe-bubble';
    bubble.innerHTML = 'Subscribe to our newsletter.<br>Stay up to date.';
    document.body.appendChild(bubble);

    function showBubble(button) {
      var rect = button.getBoundingClientRect();
      bubble.style.left = rect.right + 'px';
      bubble.style.top = rect.top + rect.height / 2 + 'px';
      bubble.classList.add('demcon-subscribe-bubble-visible');
    }

    function hideBubble() {
      bubble.classList.remove('demcon-subscribe-bubble-visible');
    }

    var form = document.querySelector('.framer-1b6jkmt');
    var button = form && form.querySelector('button');
    if (!button) return;
    button.addEventListener('mouseenter', function () {
      showBubble(button);
    });
    button.addEventListener('mouseleave', hideBubble);
  }

  // Tag every real clickable link/button (plus the header nav bar as a
  // whole, so moving between menu items doesn't cross untagged gap space)
  // so it swaps in the custom cursor on hover. Filled or bordered ones
  // additionally grow on hover. Descendants don't need tagging individually
  // -- sticky-nav.css's ".demcon-cursor-target:hover *" rule covers them,
  // `!important` and all, which is what actually closes the gaps: Framer
  // bakes explicit `cursor: pointer` onto arbitrary descendants (icons,
  // number labels), and an element's own explicit cursor always beats one
  // inherited from an ancestor, so only a higher-specificity override reaches
  // them.
  function enhanceButtons() {
    var header = document.querySelector(HEADER_SELECTOR);
    if (header) header.classList.add('demcon-cursor-target');
    var candidates = Array.prototype.slice.call(document.querySelectorAll('a, button, [data-border="true"]'));
    candidates.forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.cursor !== 'pointer') return;
      el.classList.add('demcon-cursor-target');
      if (el.closest('.framer-TkHaO') || el.closest('.framer-NoclU') || el.closest('.framer-qtbtE')) return;
      var hasBorder = el.getAttribute('data-border') === 'true';
      var bg = cs.backgroundColor;
      var hasFill = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (!hasBorder && !hasFill) return;
      el.classList.add('demcon-hover-grow');
    });
  }

  // Replace the native OS pointer with an enlarged custom arrow cursor while
  // hovering a tagged element (link/button/header/agenda row), instead of
  // the OS hand/pointer icon. The site's own click-burst effect (a global
  // document "click" listener with no target exclusions) keeps working
  // underneath since we never block the event.
  function setupCustomCursor() {
    // Touch devices have no real mouse -- skip creating the cursor element
    // entirely rather than risk it getting stuck visible after a tap (some
    // mobile browsers fire a synthetic mousemove/:hover on touch).
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var cursorEl = document.createElement('div');
    cursorEl.className = 'demcon-custom-cursor';
    cursorEl.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 15.2 L10.4 21.6 L13.2 20.3 L10.4 14 L16.5 14 Z" fill="#030509" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursorEl);

    document.addEventListener(
      'mousemove',
      function (e) {
        cursorEl.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
        var overTarget = e.target.closest && e.target.closest('.demcon-cursor-target');
        cursorEl.classList.toggle('demcon-custom-cursor-visible', !!overTarget);
      },
      { passive: true }
    );
  }

  // Fade the hero image in shortly after load, matching Framer's original
  // per-element timing for this element (a pure fade, delay 1.5s, duration
  // 1.3s -- see the transition on .framer-1mmgwc5 in sticky-nav.css).
  // The "SAME SHIT, DIFFERENT CENTURY" bubble (.framer-1sl0blg) fades and
  // rotates in alongside it -- originally an on-scroll appear animation,
  // moved here to trigger on load together with the hero per user request.
  function setupHeroFade() {
    var hero = document.querySelector('.framer-1mmgwc5');
    if (hero) {
      // The element's baked SSR inline style (opacity:0; transform:translateY(40px))
      // has higher precedence than any class-based rule, so the fade has to
      // overwrite that same inline opacity directly. The transition property
      // itself still comes from sticky-nav.css (inline styles here never set
      // it), so it's already primed by the time this flips the value.
      hero.style.opacity = '1';
    }

    var bubble = document.querySelector('.framer-1sl0blg');
    if (bubble) {
      // Its baked inline style is the same generic translateY placeholder,
      // which doesn't match this element's real rotate-in treatment -- set
      // the correct starting rotation first, with transitions off, so that
      // correction itself doesn't animate; only the subsequent flip to its
      // resting rotation (still driven by the CSS transition) should.
      bubble.style.transition = 'none';
      bubble.style.transform = 'rotate(50deg)';
      void bubble.offsetHeight;
      bubble.style.transition = '';
      bubble.style.opacity = '1';
      bubble.style.transform = 'rotate(0deg)';
    }
  }

  // Generic scroll-reveal fade-up for the page's other appear-on-scroll
  // elements. Framer's appear system isn't limited to elements carrying
  // data-framer-appear-id -- plenty of others (paragraph wrappers, list
  // items, per-word text spans) carry the exact same baked SSR placeholder
  // (opacity:0, sometimes with a translateY/blur alongside it) without that
  // attribute. Matching on the baked opacity itself, rather than the
  // attribute, catches all of them uniformly.
  function setupScrollReveal() {
    var els = Array.prototype.filter.call(document.querySelectorAll('[style]'), function (el) {
      if (el.classList.contains('framer-1mmgwc5') || el.classList.contains('framer-1sl0blg')) return false;
      return el.style.opacity !== '' && parseFloat(el.style.opacity) === 0;
    });
    if (!els.length) return;

    function revealInstantly(el) {
      el.style.opacity = '1';
      if (el.style.transform && el.style.transform.indexOf('translateY') !== -1) {
        el.style.transform = 'none';
      }
    }

    // IntersectionObserver proved unreliable here in testing -- elements
    // batched into its initial callback (everything already on screen at
    // load, which for a page this size is dozens of elements at once) would
    // silently and inconsistently never get revealed. Plain scroll-driven
    // getBoundingClientRect checks (the same pattern the header's adaptive
    // color already uses reliably) sidestep it entirely. Reveals are
    // instant rather than fading in -- less polish, but nothing here is
    // allowed to end up permanently invisible.
    var pending = els.slice();

    function checkPending() {
      pending = pending.filter(function (el) {
        var rect = el.getBoundingClientRect();
        var inView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
        if (inView) revealInstantly(el);
        return !inView;
      });
    }

    checkPending();
    if (!pending.length) return;

    // Deliberately no requestAnimationFrame throttling here -- rAF callbacks
    // proved unreliable in testing (queued but never firing), which would
    // silently break this the same way the IntersectionObserver version
    // did. checkPending() is a handful of getBoundingClientRect() calls, not
    // canvas sampling, so running it directly on every scroll/resize event
    // is cheap enough not to need throttling anyway.
    function onScrollOrResize() {
      checkPending();
      if (!pending.length) {
        window.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
      }
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
  }

  // Text Ticker marquee ("DEMCON 2027 / FOR THE GLOBAL LEFT / THE ROAD TO
  // BRUXELLES / JOIN US", repeating). Framer drove this with a continuous
  // JS-updated translateX; the static export just froze whatever position
  // it was at, at export time. A CSS keyframe loop is far more robust than
  // trying to replicate a continuous JS animation loop here: duplicate the
  // track once so the content is two identical, back-to-back copies, then
  // animate exactly halfway across -- the second copy lands exactly where
  // the first started, so the loop is seamless regardless of text width.
  function setupMarquee() {
    var section = document.querySelector('[data-framer-name="Text Ticker"]');
    if (!section) return;
    var track = section.querySelector('div[style*="overflow:hidden"]');
    var content = track && track.children[0];
    if (!content) return;
    content.style.transform = 'none';
    var clone = content.cloneNode(true);
    track.appendChild(clone);
    track.classList.add('demcon-marquee-track');
  }

  // Agenda list rows cycle through 4 hover-highlight colors (cyan, green,
  // yellow, pink) rather than one fixed color -- tag each row with which of
  // the 4 it gets, so sticky-nav.css can key its :hover rules off the class.
  function setupAgendaHover() {
    var titles = document.querySelectorAll('.ux-title');
    titles.forEach(function (el, i) {
      el.classList.add('demcon-agenda-hue-' + (i % 4));
    });
    // Tag the whole list's shared container (not just each row) so the
    // custom cursor stays on across the dividers and gaps between rows too
    // -- it only reverts to the native pointer once the mouse leaves the
    // list entirely.
    if (titles.length) {
      var container = titles[0].parentElement;
      while (container && !Array.prototype.every.call(titles, function (t) { return container.contains(t); })) {
        container = container.parentElement;
      }
      if (container) container.classList.add('demcon-cursor-target');
    }
  }

  // CTA buttons (Participate section's "Apply to Speak" / "Register to
  // Attend" / "Request Info", and any others sharing this component) are
  // built for a text-swap-on-hover effect: the visible label
  // (.framer-12vo1jw) slides out to the right while a second copy
  // (.framer-1g31bsy, positioned off-screen at rest) slides in to replace
  // it. Framer's own CSS already defines both the resting and
  // ".hover"-class positions -- sticky-nav.css adds the plain :hover
  // versions of those same rules. Three real bugs in the baked static
  // HTML/CSS: every instance's .framer-1g31bsy was left with the same
  // unedited placeholder text ("send a message") instead of its own
  // button's label; it's styled in a different, wider font (Satoshi) than
  // the visible label (League Spartan) at the same weight; and a single
  // guessed slide distance doesn't work for every button, since
  // .framer-1g31bsy (position:absolute, sitting at a fixed left:-200px)
  // and .framer-12vo1jw (position:relative, wherever normal flow and this
  // particular button's padding puts it) are positioned relative to
  // different things, so the exact gap between their resting spots varies
  // per button width -- a guessed constant overshoots on some and
  // undershoots on others. Fix all three here: match the text, match the
  // font (same family, bolder weight, not a wider typeface), and measure
  // the real on-screen gap between the two elements' resting positions so
  // the slide-in lands exactly on target regardless of button size.
  function setupCtaButtonHover() {
    var pairs = [];
    document.querySelectorAll('.framer-12vo1jw').forEach(function (visible) {
      var button = visible.closest('button');
      var hidden = button && button.querySelector('.framer-1g31bsy');
      var p = hidden && hidden.querySelector('p');
      var visibleP = visible.querySelector('p');
      if (!p || !visibleP) return;
      p.textContent = visible.textContent;
      p.style.setProperty('--framer-font-family', getComputedStyle(visibleP).getPropertyValue('--framer-font-family'));
      p.style.setProperty('--framer-font-weight', '700');
      p.style.fontWeight = '700';
      pairs.push({ button: button, hidden: hidden, visible: visible, p: p, visibleP: visibleP });
    });
    if (!pairs.length) return;

    // .framer-dk5ask (each button's Title Wrapper) uses width:min-content,
    // sizing itself to fit only the regular-weight label -- the only
    // in-flow content, since the bold copy is position:absolute and
    // doesn't contribute to that sizing. Bold text is inherently wider than
    // regular text at the same font-size, so it overflows that fixed-width
    // box and gets clipped by its overflow:hidden. Rather than growing the
    // box (which should stay the same size on hover), scale the bold
    // text's font-size down by just enough that its rendered width matches
    // the regular label's. Measuring has to wait for document.fonts.ready:
    // measuring right away can catch the fallback font mid-swap (font-display:
    // swap), understating the real width and under-scaling as a result --
    // which is exactly what happened to one of these three buttons in
    // testing while the other two happened to measure fine.
    function measure() {
      pairs.forEach(function (pair) {
        // Always measure from the true, un-scaled size -- this runs twice
        // (once immediately, once after fonts.ready), and re-deriving the
        // scale from an already-shrunk font-size on the second pass would
        // compound rounding error instead of correcting it.
        pair.p.style.fontSize = '';
        var visibleWidth = pair.visibleP.scrollWidth;
        var boldWidth = pair.p.scrollWidth;
        if (boldWidth > visibleWidth && boldWidth > 0) {
          // A couple of extra percent beyond the exact ratio guards against
          // scrollWidth's own integer rounding -- without it, a scale
          // computed from e.g. 148 vs 149 (already off by a rounded pixel)
          // can still leave the result a pixel over.
          var scale = (visibleWidth / boldWidth) * 0.98;
          var baseFontSize = parseFloat(getComputedStyle(pair.visibleP).fontSize);
          pair.p.style.fontSize = baseFontSize * scale + 'px';
        }
        var slide = pair.visible.getBoundingClientRect().left - pair.hidden.getBoundingClientRect().left;
        pair.button.style.setProperty('--cta-slide', slide + 'px');
      });
    }

    measure();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure);
    }
  }

  // Typewriter cycle in the hero ("uniting pro-democracy voices" / "for a
  // just, free, and equal world" / "the blueprint for progress"), matching
  // the original Framer component's config (96ms/char, 2s pause between
  // phrases, loops forever). The baked SSR text ("unitin") is a mid-typing
  // snapshot of the first phrase -- picked up from exactly where it left
  // off rather than restarting, so there's no reset flash on load.
  function setupTypewriter() {
    var content = document.querySelector('#r9txkP5Ui .text-type__content');
    if (!content) return;

    var PHRASES = ['uniting pro-democracy voices', 'for a just, free, and equal world', 'the blueprint for progress'];
    var TYPING_SPEED = 96;
    var PAUSE_DURATION = 2000;
    var phraseIndex = 0;
    var charIndex = content.textContent.length;
    var deleting = false;

    function tick() {
      var phrase = PHRASES[phraseIndex];
      if (!deleting) {
        content.textContent = phrase.slice(0, charIndex);
        if (charIndex >= phrase.length) {
          deleting = true;
          setTimeout(tick, PAUSE_DURATION);
          return;
        }
        charIndex++;
      } else {
        content.textContent = phrase.slice(0, charIndex);
        if (charIndex <= 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % PHRASES.length;
          setTimeout(tick, TYPING_SPEED);
          return;
        }
        charIndex--;
      }
      setTimeout(tick, TYPING_SPEED);
    }

    setTimeout(tick, TYPING_SPEED);
  }

  // Word-by-word scroll-scrub highlight for the "Because another politics
  // is possible..." statement -- each word already sits in its own <span>
  // with an inline color and its own "transition:color 100ms ease-out"
  // (baked in the static HTML), so revealing is just flipping each span's
  // color between dim and lit as the paragraph scrolls through the
  // viewport; no new CSS transition needed.
  function setupTextScrollReveal() {
    var paragraph = document.querySelector('[data-framer-name="Statistics - Section"] p[aria-label]');
    if (!paragraph) return;
    var words = Array.prototype.filter.call(paragraph.querySelectorAll('span'), function (span) {
      return span.style.color && span.textContent.trim() !== '';
    });
    if (!words.length) return;

    var LIT = 'rgb(255, 255, 255)';
    var DIM = 'rgba(255, 255, 255, 0.2)';

    function update() {
      var rect = paragraph.getBoundingClientRect();
      var vh = window.innerHeight;
      var startY = vh * 0.8;
      var endY = vh * 0.2;
      var progress = (startY - rect.top) / (startY - endY);
      progress = Math.max(0, Math.min(1, progress));
      var litCount = Math.round(progress * words.length);
      words.forEach(function (word, i) {
        word.style.color = i < litCount ? LIT : DIM;
      });
    }

    var queued = false;
    function queueUpdate() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        update();
      });
    }

    update();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate, { passive: true });
  }

  // This script is loaded with `defer`, which already guarantees the DOM is
  // fully parsed by the time it runs.
  init();
  addReadMoreLink();
  setupHeroSubscribeButton();
  enhanceButtons();
  setupCustomCursor();
  setupHeroFade();
  setupScrollReveal();
  setupMarquee();
  setupAgendaHover();
  setupCtaButtonHover();
  setupTypewriter();
  setupTextScrollReveal();
})();
