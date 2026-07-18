(function () {
  var HEADER_SELECTOR = '.framer-1kfysrm-container';
  var SECTION_IDS = ['about', 'salons', 'agenda', 'participate', 'contact'];

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

    // About page stacking cards: Principles and Join Us both sample as
    // "white" instead of their real yellow, because the pinned sub-nav
    // marquee (opaque pink) always sits directly under the header's
    // sample point once it's pinned, and pink's nearest swatch match is
    // white/cream -- there's no pixel to sample here that would ever
    // read as yellow. Listed in z-index order (matches the CSS stacking
    // order): a plain "does the sample point fall inside this section's
    // rect" check isn't enough on its own, because each sticky card's own
    // rect keeps satisfying that well past the point a later, higher
    // z-index card has visually covered it (same reason
    // setupAboutSubNav's scroll-spy has to walk these in z-index order
    // too, rather than trusting IntersectionObserver) -- so this instead
    // finds the *last* one (highest z-index) whose top has reached the
    // sample point.
    var ABOUT_STACK_BUCKETS = [
      { selector: '.demcon-about-page .demcon-principles-section', bucket: 'yellow' },
      { selector: '.demcon-about-page .framer-1rbxc9t', bucket: 'white' },
      { selector: '.demcon-about-page .framer-13wosc3', bucket: 'yellow' }
    ];

    function forcedBucket(y) {
      for (var i = 0; i < FORCED_SECTIONS.length; i++) {
        var el = document.querySelector(FORCED_SECTIONS[i].selector);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) return FORCED_SECTIONS[i].bucket;
      }
      var current = null;
      for (var j = 0; j < ABOUT_STACK_BUCKETS.length; j++) {
        var stackEl = document.querySelector(ABOUT_STACK_BUCKETS[j].selector);
        if (!stackEl) continue;
        if (stackEl.getBoundingClientRect().top <= y) current = ABOUT_STACK_BUCKETS[j].bucket;
      }
      return current;
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

    // Real navigation to the About page now, not an in-page anchor scroll
    // -- this function only ever finds its target on index.html, so the
    // root-relative path is correct regardless of where else it's called.
    var link = document.createElement('a');
    link.href = './about/index.html';
    link.className = 'demcon-read-more';
    link.textContent = 'READ MORE';

    wrapper.appendChild(link);
  }

  // Shared by every "subscribe"-style form on the page -- the Hero's own
  // signup (.framer-1b6jkmt) and the Join Us section's (.framer-p500jw,
  // which also appears duplicated onto about/index.html after Bruxelles
  // Calling). One bubble element is reused and just repositioned to
  // whichever button is currently hovered, rather than creating one per
  // form.
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

    var forms = document.querySelectorAll('.framer-1b6jkmt, .framer-p500jw');
    forms.forEach(function (form) {
      var button = form.querySelector('button');
      if (!button) return;
      button.addEventListener('mouseenter', function () {
        showBubble(button);
      });
      button.addEventListener('mouseleave', hideBubble);
    });
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
      // it), so it's already primed by the time this flips the value. The
      // baked translateY(40px) is cleared to a clean rest position too --
      // setupHeroIntro's update() now drives this element's transform as a
      // scroll-linked "tumble away", so it needs a known zero baseline
      // instead of that leftover static offset.
      hero.style.opacity = '1';
      hero.style.transform = 'none';
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

  // Turns the hero into a scroll-locked intro: the illustration (+ its
  // speech bubble) is pinned as a full-screen overlay on load, with a
  // bouncing "scroll down" arrow. The first scroll attempt locks scrolling
  // entirely and plays the whole sequence -- her tumbling away, the
  // "Welcome to DEMCON" text + sparkles fading in -- over fixed TIME
  // rather than scroll position, so a fast wheel flick or trackpad swipe
  // can't blow through it. Only once that's genuinely finished does
  // scrolling unlock and the map's parallax begin. Call *before*
  // setupHeroFade (which owns the illustration/bubble's initial load-in
  // animation) -- the bubble needs to already be in its final resting
  // place (this function reparents it onto the illustration) before that
  // animation's transition is set up, or reparenting mid-transition
  // silently cancels it in some browsers.
  function setupHeroIntro() {
    var hero = document.querySelector('.framer-1mmgwc5');
    // .framer-ai4nw9 ("Title & Content": badge/heading/tagline/date) and
    // .framer-1b6jkmt (the signup form) are SIBLINGS -- both direct children
    // of .framer-6c79b6 ("Container"), alongside the illustration -- not
    // parent/child. Driving only the former left the signup form sitting at
    // its native opacity:1 the whole time, visible right through the
    // illustration/overlay before either had faded. Container is the
    // lowest shared ancestor of everything that should pop in together.
    var content = document.querySelector('.framer-6c79b6');
    if (!hero || !content) return;
    var bubble = document.querySelector('.framer-1sl0blg');
    var mapBg = document.querySelector('.framer-1yprofd');
    // The two large star-burst images flanking the illustration are
    // siblings of `content` (both live under the same "Hero Section"
    // wrapper), not descendants of it, so they don't inherit its opacity
    // fade the way everything else does -- they render at opacity:1 from
    // the very first frame regardless of scroll. Each also carries a
    // baked, now-inert Framer SSR placeholder (translateY + will-change,
    // a dead leftover of a scroll effect the since-removed runtime used to
    // drive), which we preserve as a base offset rather than clobber.
    var sparkles = [];
    ['.framer-m2qlmo', '.framer-3ui96g'].forEach(function (sel, i) {
      var el = document.querySelector(sel);
      if (!el) return;
      var match = /translateY\(([-\d.]+)px\)/.exec(el.style.transform || '');
      sparkles.push({
        el: el,
        base: match ? parseFloat(match[1]) : 0,
        baseOpacity: 0,
        baseTransform: '',
        twinklePhase: i * 0.5,
        twinklePeriod: 2.6 + i * 0.5,
      });
    });

    // The two small star icons flanking the heading itself, inside
    // `content` -- their own opacity/transform are never driven by this
    // fade/parallax logic (they're already correctly gated for free by
    // inheriting content's ancestor opacity), so their "base" here is just
    // their permanent baked scale+rotate, never touched again -- only the
    // twinkle ticker below ever re-renders them.
    var smallIcons = [];
    ['.framer-19q786b', '.framer-625tc9'].forEach(function (sel, i) {
      var el = document.querySelector(sel);
      if (!el) return;
      smallIcons.push({
        el: el,
        base: 0,
        baseOpacity: 1,
        baseTransform: el.style.transform || '',
        twinklePhase: 0.25 + i * 0.5,
        twinklePeriod: 2.9 + i * 0.5,
      });
    });

    // Renders a star's *logical* opacity/transform (set by the fade-in/
    // parallax/hide logic below) combined with its own slow, staggered
    // twinkle -- a subtle scale+opacity pulse, out of phase and at a
    // slightly different period per star, so they read as ambient
    // twinkling rather than one thing blinking in unison. Scale is
    // appended to the end of the transform string (transforms compose
    // left-to-right) so it layers on top of whatever position/parallax
    // transform is already there instead of replacing it.
    function renderSparkle(s) {
      var wave = s.twinkleWave || 0;
      s.el.style.opacity = String(s.baseOpacity * (0.85 + wave * 0.15));
      s.el.style.transform = s.baseTransform + ' scale(' + (0.95 + wave * 0.1) + ')';
    }

    var allStars = sparkles.concat(smallIcons);
    var twinkleTimer = setInterval(function () {
      var now = Date.now() / 1000;
      allStars.forEach(function (s) {
        var t = (now / s.twinklePeriod + s.twinklePhase) % 1;
        s.twinkleWave = (Math.sin(t * Math.PI * 2) + 1) / 2;
        renderSparkle(s);
      });
    }, 100);

    // Measured before hero is taken out of flow below -- the spacer needs
    // to hold roughly this much space open so `content`'s own layout
    // doesn't collapse/jump once hero is gone.
    var heroNaturalHeight = hero.getBoundingClientRect().height;
    var spacer = document.createElement('div');
    spacer.className = 'demcon-hero-intro-spacer';
    spacer.style.height = heroNaturalHeight + 'px';
    hero.parentNode.insertBefore(spacer, hero);

    // Framer scopes every sizing rule for both of these elements under a
    // ".framer-L1F0F" root-wrapper ancestor selector (real CSS, not a
    // missing-variant dead end this time) -- appending the overlay to
    // <body> directly would carry them outside that subtree and drop every
    // one of those rules, collapsing the illustration to 0x0. Keep the
    // overlay inside the same root instead.
    var root = document.querySelector('.framer-L1F0F') || document.body;
    var overlay = document.createElement('div');
    overlay.className = 'demcon-hero-intro-overlay';
    root.appendChild(overlay);
    overlay.appendChild(hero);
    // Parented onto the illustration itself (which is already
    // position:relative + overflow:visible) rather than the overlay, so its
    // "next to her head" placement is relative to *her*, not the viewport --
    // otherwise it drifts away from her as soon as the viewport width
    // changes where she sits.
    if (bubble) hero.appendChild(bubble);

    // Bottom-right instead of bottom-center -- centered under her, the
    // circle sat right on top of her own artwork (skirt/legs) at most
    // viewport heights and was easy to miss against it.
    var arrow = document.createElement('div');
    arrow.className = 'demcon-hero-scroll-arrow';
    arrow.innerHTML =
      '<span class="demcon-hero-scroll-label">Scroll</span>' +
      '<span class="demcon-hero-scroll-circle"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#030509" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6 14l6 6 6-6"/></svg></span>';
    overlay.appendChild(arrow);

    content.style.willChange = 'opacity, transform';

    // Same relative pacing as the old scroll-distance version (hero
    // finishes tumbling partway through; text starts a little after hero
    // and finishes right at the end), just expressed as fractions of a
    // fixed duration instead of vh, since this now plays on a clock rather
    // than being scrubbed by scroll position.
    var DURATION_MS = 2200;
    var HERO_FRAC = 0.5;
    var TEXT_START_FRAC = 0.2;
    var TEXT_FRAC = 0.8;

    var phase = 'idle'; // 'idle' -> 'animating' -> 'released'
    var startTime = null;
    var contentShift = 0;

    function visibleContentBounds() {
      // content itself has flex:1 0 0px -- it *stretches* to fill the
      // Hero Section's full cross-axis height, which is now enormous
      // (padding-bottom:60vh, added for the map's parallax runway), so
      // content.getBoundingClientRect() massively overstates how tall the
      // actual visible text/signup-form content is (its own box carries a
      // huge amount of invisible trailing space from that stretch).
      // Centering against that inflated box pushed the real, visible
      // content up near the top instead of centering it. Union the
      // *children*'s rects instead -- that's the real visible span.
      var tops = [];
      var bottoms = [];
      Array.prototype.forEach.call(content.children, function (c) {
        var r = c.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return; // empty ssr-variant wrappers
        tops.push(r.top);
        bottoms.push(r.bottom);
      });
      var top = Math.min.apply(null, tops);
      var bottom = Math.max.apply(null, bottoms);
      return { top: top, height: bottom - top };
    }

    function measure() {
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!vh) return;
      // contentShift is a permanent downward correction (measured live,
      // not guessed, so it holds regardless of viewport size/content
      // height) so that once fully faded in, the visible content's center
      // lands on the viewport's center instead of wherever its native
      // flex-centered position happens to put it. There's no scroll-
      // driven drift to compensate for anymore (scrolling is locked for
      // the whole fade), so this is just the raw correction.
      var prevTransform = content.style.transform;
      content.style.transform = 'none';
      var bounds = visibleContentBounds();
      content.style.transform = prevTransform;
      contentShift = (vh - bounds.height) / 2 - bounds.top;
    }

    function applyFrame(t) {
      var heroProgress = Math.min(Math.max(t / HERO_FRAC, 0), 1);
      var textProgress = Math.min(Math.max((t - TEXT_START_FRAC) / TEXT_FRAC, 0), 1);
      overlay.style.opacity = String(1 - heroProgress);
      overlay.style.pointerEvents = heroProgress >= 1 ? 'none' : 'auto';
      // She tumbles down and away -- sliding down, rotating, and shrinking
      // as though sinking into the background -- rather than just fading
      // in place. The bubble is a child of hero, so it tumbles with her.
      hero.style.transform =
        'translate(' +
        heroProgress * -60 +
        'px, ' +
        heroProgress * 220 +
        'px) rotate(' +
        heroProgress * -40 +
        'deg) scale(' +
        (1 - heroProgress * 0.35) +
        ')';
      // Sparkles fade in together with the text; contentShift keeps them
      // flanking the heading (see measure() above) instead of stranded at
      // their original position while the heading moves down.
      sparkles.forEach(function (s) {
        s.baseOpacity = textProgress;
        s.baseTransform = 'translateY(' + (s.base + contentShift) + 'px)';
        renderSparkle(s);
      });
      content.style.opacity = String(textProgress);
      // The extra (1 - textProgress) * 80 rides on top of contentShift as
      // a fading entrance flourish -- it visibly rises the last bit into
      // place, then settles at exactly contentShift once fully faded in.
      content.style.transform =
        'translateY(' + (contentShift + (1 - textProgress) * 80) + 'px) scale(' + (0.95 + textProgress * 0.05) + ')';
    }

    // Content is normal-flow (not fixed) during the fade so its layout
    // stays simple, but that means the instant scrolling resumes after
    // release, it would immediately drift straight back out of center at
    // the same 1:1 rate as any other in-flow element -- undoing the
    // centering the whole fade just achieved. Freezing it (and the
    // sparkles) at their current, already-correctly-centered on-screen
    // rect via position:fixed keeps them pinned there regardless of how
    // much further the visitor scrolls, so only the map moves underneath.
    // Explicit width/height in px avoids Framer's own percentage-based
    // sizing rules re-resolving against the viewport (a fixed element's
    // containing block) instead of their original parent.
    function pin() {
      // measure() (called throughout the fade) already keeps the visible
      // content correctly centered via contentShift, so freezing content's
      // *current* rendered rect is already correct -- just convert it from
      // "normal flow + transform" to position:fixed at that same spot.
      var rect = content.getBoundingClientRect();

      // content is the Hero Section's tallest flex item (flex-flow:row ->
      // height is driven by its tallest child) -- removing it from flow
      // below would otherwise collapse the section straight down to just
      // its own padding, losing the extra scroll runway added for the
      // map's parallax. A same-height spacer in its place holds that room
      // open, same trick as hero's own spacer above.
      var contentSpacer = document.createElement('div');
      contentSpacer.style.height = rect.height + 'px';
      content.parentNode.insertBefore(contentSpacer, content);

      content.style.position = 'fixed';
      content.style.margin = '0';
      content.style.top = rect.top + 'px';
      content.style.left = rect.left + 'px';
      content.style.width = rect.width + 'px';
      content.style.transform = 'none';

      sparkles.forEach(function (s) {
        var r = s.el.getBoundingClientRect();
        s.el.style.position = 'fixed';
        s.el.style.margin = '0';
        s.el.style.top = r.top + 'px';
        s.el.style.left = r.left + 'px';
        s.el.style.right = 'auto';
        s.el.style.bottom = 'auto';
        s.el.style.width = r.width + 'px';
        s.el.style.height = r.height + 'px';
        s.baseTransform = '';
        renderSparkle(s);
      });

    }

    // Once released, ordinary scrolling resumes and drives the map's
    // parallax underneath the now-pinned content, plus the sparkles' own
    // slower, opposite-direction drift on top of their pinned position.
    // Pinned content/sparkles are never explicitly hidden or faded here --
    // Salons sits above the Hero Section in z-index (sticky-nav.css) and
    // is itself sticky, so it physically slides up and covers them the
    // same way every other stacking card covers the one before it,
    // instead of the Hero's own content fading away on a separate timer
    // first and leaving Salons to arrive over an already-empty section.
    function parallax() {
      var scrollY = window.scrollY;
      if (mapBg) mapBg.style.transform = 'translateY(' + scrollY * 0.3 + 'px)';
      sparkles.forEach(function (s) {
        s.baseTransform = 'translateY(' + scrollY * -0.12 + 'px)';
        renderSparkle(s);
      });
    }

    // setTimeout rather than requestAnimationFrame -- rAF callbacks have
    // proven unreliable elsewhere in this file (queued but silently never
    // firing in some conditions/tabs); a ~60fps timer tick is plenty
    // smooth for this and doesn't share that failure mode.
    function tick() {
      var t = Math.min((Date.now() - startTime) / DURATION_MS, 1);
      applyFrame(t);
      if (t < 1) {
        setTimeout(tick, 16);
      } else {
        pin();
        phase = 'released';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    }

    function beginAnimating() {
      if (phase !== 'idle') return;
      phase = 'animating';
      measure();
      // Locks scrolling for the whole sequence -- without this, a fast
      // wheel flick or trackpad swipe scrubs straight past the fade
      // instead of the visitor ever seeing it pause and complete.
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      startTime = Date.now();
      tick();
    }

    // wheel/touchmove/keydown are the primary trigger + lock: intercepted
    // and prevented *before* any actual scrolling happens, so there's no
    // jump when the sequence begins. The 'scroll' listener is a safety net
    // for input this doesn't catch (e.g. dragging the scrollbar directly)
    // -- it snaps back to 0 if scrolling slips through while idle/locked,
    // and once released, drives the map/sparkle parallax as normal.
    function onWheelOrTouch(e) {
      if (phase === 'idle') {
        e.preventDefault();
        beginAnimating();
      } else if (phase === 'animating') {
        e.preventDefault();
      }
    }

    var SCROLL_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'End', 'Home'];
    function onKeydown(e) {
      if (SCROLL_KEYS.indexOf(e.key) === -1) return;
      onWheelOrTouch(e);
    }

    function onScroll() {
      if (phase === 'released') {
        parallax();
      } else if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
        if (phase === 'idle') beginAnimating();
      }
    }

    document.addEventListener('wheel', onWheelOrTouch, { passive: false });
    document.addEventListener('touchmove', onWheelOrTouch, { passive: false });
    document.addEventListener('keydown', onKeydown, { passive: false });
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    measure();
    applyFrame(0);
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
      // The first two are handled by setupHeroFade instead. The third,
      // .framer-6c79b6 ("Container"), is the "Welcome to DEMCON" content
      // block that setupHeroIntro drives via scroll -- its opacity is
      // legitimately 0 at rest (fully hidden behind the intro
      // illustration), which this function's generic "opacity:0 means
      // baked-hidden, reveal it" matcher can't tell apart from Framer's own
      // baked placeholders. Without this exclusion it "reveals"
      // (permanently overwrites back to opacity:1/transform:none) the
      // content block the instant this runs, regardless of scroll
      // position, since it runs right after setupHeroIntro in the call
      // list below.
      // The sparkle star images now also bake opacity:0 (previously
      // opacity:1, changed to avoid a flash-of-visible-sparkle on load) --
      // same conflict, same fix: setupHeroIntro's update() owns their
      // opacity via scroll, so this generic revealer must leave them alone.
      // The Movement card's heading/arrow/paragraph (Journey Section) are
      // owned by setupMovementReveal's staged sequence instead -- same
      // conflict again: this function's `els` filter runs *before*
      // setupMovementReveal clears their inline styles (both run at page
      // load, in order), so without this exclusion it captures all three
      // here first and later force-writes opacity:1 inline the instant its
      // own (unrelated, unstaggered) inView check passes, hijacking
      // setupMovementReveal's sequence -- and for the arrow specifically,
      // that inView check was already confirmed never to pass at all (see
      // the CSS comment), leaving it permanently invisible either way.
      if (
        el.classList.contains('framer-1mmgwc5') ||
        el.classList.contains('framer-1sl0blg') ||
        el.classList.contains('framer-6c79b6') ||
        el.classList.contains('framer-m2qlmo') ||
        el.classList.contains('framer-3ui96g') ||
        el.classList.contains('framer-hvsa7k') ||
        el.classList.contains('framer-e571rj') ||
        el.classList.contains('framer-fobxvj')
      ) {
        return false;
      }
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

  // Text Ticker / about-page sub-nav marquee. Originally Framer's own
  // "DEMCON 2027 / FOR THE GLOBAL LEFT / THE ROAD TO BRUXELLES / JOIN US"
  // ticker, driven by a continuous JS-updated translateX that the static
  // export just froze in place. Repurposed as a 3-link sub-nav with the
  // same scrolling-marquee motion. Reusing Framer's own markup/padding
  // for this kept causing a black gap down one or both edges at some
  // viewport widths (its inherited box model has more layers -- an outer
  // section padding, an inner container, an inline-styled track div --
  // than were obvious from the rendered page, and something in that
  // stack kept reintroducing an inset). Rebuilt from scratch instead:
  // this owns its entire DOM subtree and CSS, so there's no inherited
  // padding/width left to fight. The viewport div uses the standard
  // "full-bleed" trick (100vw + 50%-left + negative margin) so it always
  // spans edge to edge regardless of any ancestor's box model, and the
  // track is filled with enough repeated copies to exceed twice the
  // viewport width before being doubled for the seamless loop -- so it
  // can never run out of content regardless of screen size.
  function setupMarquee() {
    var section = document.querySelector('[data-framer-name="Text Ticker"]');
    if (!section) return;
    var existingLinks = Array.prototype.slice.call(section.querySelectorAll('.demcon-subnav-link'));
    var seen = {};
    var uniqueLinks = existingLinks.filter(function (link) {
      var id = link.getAttribute('data-subnav-id');
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
    if (!uniqueLinks.length) return;

    function buildGroup() {
      var group = document.createElement('div');
      group.className = 'demcon-marquee-group';
      uniqueLinks.forEach(function (link) {
        group.appendChild(link.cloneNode(true));
        var sep = document.createElement('span');
        sep.className = 'demcon-subnav-sep';
        sep.innerHTML = '&nbsp;&bull;&nbsp;';
        group.appendChild(sep);
      });
      return group;
    }

    section.innerHTML = '';
    section.classList.add('demcon-marquee-section');
    var viewport = document.createElement('div');
    viewport.className = 'demcon-marquee-viewport';
    var track = document.createElement('div');
    track.className = 'demcon-marquee-track';
    viewport.appendChild(track);
    section.appendChild(viewport);

    // Rebuilds the track's contents from a clean slate every time it's
    // called, rather than trying to incrementally extend it -- simpler,
    // and self-correcting regardless of *why* a previous pass came up
    // short (this environment has a known quirk where window.innerWidth
    // briefly reads 0 right after navigation, but the same fallback also
    // covers a real, legitimate window resize).
    function rebuildTrack() {
      track.innerHTML = '';
      track.appendChild(buildGroup());

      // This section is display:none by default (it only becomes
      // visible once pinned -- see setupAboutSubNav/CSS) and stays that
      // way until scroll reaches Principles, which on page load it
      // hasn't yet -- track.scrollWidth would read 0 the whole time
      // otherwise, since a display:none ancestor has no layout box to
      // measure. Force it visible just for this synchronous measurement
      // pass; nothing paints in between since the browser can't paint
      // mid-task.
      var prevDisplay = section.style.display;
      section.style.display = 'block';

      var minWidth = Math.max(window.innerWidth, 320) * 2;
      var guard = 0;
      while (track.scrollWidth < minWidth && guard < 50) {
        track.appendChild(buildGroup());
        guard++;
      }
      var singlePass = Array.prototype.slice.call(track.children);
      singlePass.forEach(function (group) {
        track.appendChild(group.cloneNode(true));
      });

      section.style.display = prevDisplay;
    }

    rebuildTrack();
    // Safety net for the innerWidth-reads-0-right-after-navigate quirk:
    // if that's what happened, this repeats the measurement shortly
    // after layout has definitely settled.
    setTimeout(rebuildTrack, 250);
    window.addEventListener('resize', rebuildTrack, { passive: true });
  }

  // The marquee (about/index.html) is now also a mini sub-nav for the 3
  // stacked cards below it (Principles, Bruxelles Calling, Join Us):
  // sticky right under the real (fixed) header, with links to smooth-
  // scroll to each, and the current one bold+underlined as you scroll
  // past it. setupMarquee duplicates its content once for the seamless
  // loop, so every link exists twice in the DOM -- click handling and the
  // active-state toggle both need to account for both copies.
  function setupAboutSubNav() {
    var section = document.querySelector('[data-framer-name="Text Ticker"]');
    // The container itself carries no height -- its nav child is
    // *independently* position:fixed too (see the shared header rule
    // above), which removes it from the container's own box, leaving the
    // container's own bounding rect at 0. The nav element is what's
    // actually visible on screen, so measure that instead.
    var header = document.querySelector('.framer-1kfysrm-container nav') || document.querySelector('.framer-1kfysrm-container');
    var principlesSection = document.getElementById('principles');
    if (!section || !header || !principlesSection) return;

    function setTop() {
      section.style.top = header.getBoundingClientRect().height + 'px';
    }
    setTop();
    window.addEventListener('resize', setTop, { passive: true });

    // Plain position:sticky would pin this the moment Hero scrolls away,
    // and nesting it inside Principles to delay that would trap it in
    // Principles' own stacking context -- Bruxelles/Join Us (higher
    // z-index as siblings) would then cover it once they slid up. Instead
    // toggle a fixed-position class by hand once scroll actually reaches
    // the top of the Principles section, and remove it again if scrolled
    // back above that point.
    function updatePinned() {
      var reachedPrinciples = principlesSection.getBoundingClientRect().top <= 0;
      section.classList.toggle('demcon-subnav-pinned', reachedPrinciples);
      if (reachedPrinciples) setTop();
    }
    updatePinned();
    window.addEventListener('scroll', updatePinned, { passive: true });
    window.addEventListener('resize', updatePinned, { passive: true });

    function linksFor(id) {
      return Array.prototype.slice.call(section.querySelectorAll('.demcon-subnav-link[data-subnav-id="' + id + '"]'));
    }

    section.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('.demcon-subnav-link');
      if (!link) return;
      var id = link.getAttribute('data-subnav-id');
      var target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - section.getBoundingClientRect().height - header.getBoundingClientRect().height;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });

    var ids = ['principles', 'bruxelles-calling', 'about-join-us'];
    var sections = ids
      .map(function (id) {
        var el = document.getElementById(id);
        return el ? { id: id, el: el } : null;
      })
      .filter(Boolean);
    if (!sections.length) return;

    function setActive(id) {
      ids.forEach(function (otherId) {
        linksFor(otherId).forEach(function (link) {
          link.classList.toggle('is-active', otherId === id);
        });
      });
    }

    // These 3 sections are stacking cards -- each stays full-height in the
    // DOM and visually covers the ones before it once its turn comes up, so
    // their rects all overlap the same screen space at once and a normal
    // IntersectionObserver mid-screen-band check can't tell them apart.
    // Instead walk them in z-index (i.e. list) order and take the LAST one
    // that has already reached the top of the viewport -- that's the one
    // currently drawn on top.
    function updateActiveFromScroll() {
      var current = sections[0].id;
      sections.forEach(function (s) {
        if (s.el.getBoundingClientRect().top <= 1) current = s.id;
      });
      setActive(current);
    }
    updateActiveFromScroll();
    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveFromScroll, { passive: true });
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

  // Agenda list (index.html): same accordion pattern as the Principles
  // summary below -- click a row to reveal its one-line description,
  // click again (or open another row) to collapse it. Single-open across
  // the whole list, same as each Principles panel.
  function setupAgendaAccordion() {
    var rows = document.querySelectorAll('.demcon-agenda-row');
    if (!rows.length) return;
    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        var item = row.closest('.demcon-agenda-item');
        if (!item) return;
        var list = item.parentElement;
        var wasOpen = item.classList.contains('is-open');
        if (list) {
          list.querySelectorAll('.demcon-agenda-item.is-open').forEach(function (openItem) {
            if (openItem === item) return;
            openItem.classList.remove('is-open');
            var openRow = openItem.querySelector('.demcon-agenda-row');
            if (openRow) openRow.setAttribute('aria-expanded', 'false');
          });
        }
        item.classList.toggle('is-open', !wasOpen);
        row.setAttribute('aria-expanded', String(!wasOpen));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
    });
  }

  // Principles summary (about/index.html): each category is a toggle --
  // click reveals a one-sentence explanation, click again collapses it.
  // Accordion-style within each panel -- opening one closes whichever
  // other item in that same panel was already open, so at most one
  // explanation shows at a time. Hue classes for the hover highlight are
  // already baked into the markup (demcon-principles-hue-0..3, cycling
  // the same 4 colors the Agenda list's hover uses); this just owns the
  // expand/collapse state.
  function setupPrinciplesToggle(adjustStackedSections) {
    // Opening an item animates its detail panel from grid-template-rows:
    // 0fr to 1fr over 0.25s (sticky-nav.css) -- the Principles card's own
    // height, and so how far the stack lets you scroll before Bruxelles
    // Calling covers it, is computed from its content's actual height.
    // Without recomputing that after a toggle, the card's scrollable
    // range stays stuck at whatever it was on page load, so an opened
    // item's extra height gets cut off by the next card sliding over
    // before the user can scroll down to see all of it.
    document.querySelectorAll('.demcon-principles-toggle').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = button.closest('.demcon-principles-item');
        if (!item) return;
        var panel = button.closest('.demcon-principles-panel');
        var wasOpen = item.classList.contains('is-open');
        if (panel) {
          panel.querySelectorAll('.demcon-principles-item.is-open').forEach(function (openItem) {
            if (openItem === item) return;
            openItem.classList.remove('is-open');
            var openButton = openItem.querySelector('.demcon-principles-toggle');
            if (openButton) openButton.setAttribute('aria-expanded', 'false');
          });
        }
        item.classList.toggle('is-open', !wasOpen);
        button.setAttribute('aria-expanded', String(!wasOpen));

        if (!adjustStackedSections) return;
        adjustStackedSections();
        // transitionend on a grid-template-rows transition can fire
        // before the resulting layout has actually settled to its final
        // pixel height (observed: offsetHeight kept growing for a beat
        // after the event fired) -- a flat timeout past the 0.25s
        // transition is simpler and more reliable than trusting it.
        setTimeout(adjustStackedSections, 300);
      });
    });
  }

  // Principles tabs (about/index.html): "We stand against discrimination
  // based on:" / "We believe a true democracy guarantees:" -- switches
  // which .demcon-principles-panel is shown, matching the pattern already
  // used for the Agenda's category filters.
  function setupPrinciplesTabs(adjustStackedSections) {
    var tabs = document.querySelectorAll('.demcon-principles-tab');
    if (!tabs.length) return;
    var panels = document.querySelectorAll('.demcon-principles-panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var panel = tab.getAttribute('data-panel');
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        panels.forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-panel') === panel);
        });
        // Switching panels (display:none <-> block, no transition) can
        // change the Principles card's content height just as much as
        // opening an accordion item does -- e.g. one panel simply having
        // more items than the other -- so the stacking system's scroll
        // range needs recomputing here too, not just on accordion
        // toggle. No animation to wait out here, so one immediate call
        // is enough (unlike the accordion's timeout-delayed recompute).
        if (adjustStackedSections) adjustStackedSections();
      });
    });
  }

  // Universal Declaration of Human Rights, recreated as text and run
  // behind the Principles card (about/index.html) -- once this section
  // reaches the top of the viewport, .demcon-udhr-stage starts animating
  // upward through the document on its own clock, pausing on each
  // "right to" in turn (marked up as .demcon-udhr-hit in the HTML).
  // Scrolling is *not* locked for this -- unlike the two hero locks, the
  // visitor is free to keep scrolling at their own pace while it plays
  // out in the background underneath the (translucent) Principles card.
  function setupUDHRSequence() {
    var section = document.querySelector('.demcon-principles-section');
    var stage = section && section.querySelector('.demcon-udhr-stage');
    var hits = stage ? Array.prototype.slice.call(stage.querySelectorAll('.demcon-udhr-hit')) : [];
    if (!section || !stage || !hits.length) return;

    var STEP_MS = 700;
    var started = false;
    var triggerY = 0;

    function computeTrigger() {
      triggerY = section.getBoundingClientRect().top + window.scrollY;
    }
    computeTrigger();
    window.addEventListener('resize', computeTrigger, { passive: true });

    function focus(index) {
      var hit = hits[index];
      var target = section.clientHeight / 2 - (hit.offsetTop + hit.offsetHeight / 2);
      stage.style.transform = 'translateY(' + target + 'px)';
    }

    function playSequence() {
      var i = 0;
      function step() {
        if (i > 0) hits[i - 1].classList.remove('is-active');
        focus(i);
        hits[i].classList.add('is-active');
        i++;
        if (i < hits.length) {
          setTimeout(step, STEP_MS);
        } else {
          setTimeout(function () {
            hits[hits.length - 1].classList.remove('is-active');
          }, STEP_MS);
        }
      }
      step();
    }

    // Plain passive 'scroll' listener -- just watches for the section
    // reaching the top of the viewport to start the sequence once, then
    // gets out of the way; it never touches scroll position or overflow.
    function onScroll() {
      if (started || window.scrollY < triggerY - 2) return;
      started = true;
      playSequence();
    }

    document.addEventListener('scroll', onScroll, { passive: true });
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

    function setWords(progress) {
      var litCount = Math.round(progress * words.length);
      words.forEach(function (word, i) {
        word.style.color = i < litCount ? LIT : DIM;
      });
    }

    // When this section sits at the very top of the page (used as a
    // page's hero -- e.g. about/index.html) rather than deep in a long
    // scroll (its original homepage placement), the viewport-relative
    // reveal window below doesn't work: the paragraph's rect.top is
    // already near 0 (inside that window) from the very first frame, so
    // every word would read as lit with nothing left to reveal. Scrub
    // this one off raw scrollY instead (see setupHeroScrollScrub) --
    // still fully scroll-driven, just measured from the top of the page
    // rather than the paragraph's position in the viewport. Detected
    // once, up front, via the section's own natural position before any
    // scrolling.
    var sectionEl = paragraph.closest('section');
    var isHero = !!sectionEl && sectionEl.getBoundingClientRect().top < 10 && window.scrollY === 0;

    if (isHero) {
      setupHeroScrollScrub(sectionEl, setWords);
      return;
    }

    function update() {
      var rect = paragraph.getBoundingClientRect();
      var vh = window.innerHeight;
      var startY = vh * 0.8;
      var endY = vh * 0.2;
      var progress = (startY - rect.top) / (startY - endY);
      setWords(Math.max(0, Math.min(1, progress)));
    }

    // Called directly on scroll/resize, no requestAnimationFrame throttling
    // -- rAF callbacks have proven unreliable elsewhere in this file
    // (queued but silently never firing in some conditions/tabs), and
    // this update is cheap (just flipping inline color on ~20-30 spans).
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  // Scrubs the word-by-word reveal off consumed wheel/touch/key input
  // instead of raw scrollY -- and holds real page scrolling paused (via
  // preventDefault on that same input) until the reveal actually
  // finishes, same "windowed reveal" technique as setupTallCardReveal
  // below: each tick of input adds to an internal offset instead of
  // moving the page, and only once that offset reaches the full reveal
  // distance do the listeners get removed and normal scrolling resumes.
  // Without the hold, a single fast flick scrolls straight past this
  // section (and off to the next one) before the reveal has gone
  // anywhere. This section doesn't move relative to the viewport while
  // it's the first thing on the page anyway, so there's no rect.top
  // range to measure a plain scroll-position reveal window against, and
  // a fixed-duration timer (tried first) always "just happened" on the
  // first nudge rather than tracking the visitor's own scrolling. Same
  // bottom-right "Scroll" prompt as before, fading out once done.
  function setupHeroScrollScrub(sectionEl, setWords) {
    var REVEAL_DISTANCE = 700; // total consumed input needed to fully reveal
    var offset = 0;
    var done = false;

    setWords(0);

    var arrow = document.createElement('div');
    arrow.className = 'demcon-hero-scroll-arrow demcon-hero-scroll-arrow-on-dark';
    arrow.innerHTML =
      '<span class="demcon-hero-scroll-label">Scroll</span>' +
      '<span class="demcon-hero-scroll-circle"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#030509" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6 14l6 6 6-6"/></svg></span>';
    if (getComputedStyle(sectionEl).position === 'static') sectionEl.style.position = 'relative';
    sectionEl.appendChild(arrow);

    function apply() {
      var progress = offset / REVEAL_DISTANCE;
      setWords(progress);
      arrow.style.opacity = progress >= 1 ? '0' : '';
      arrow.style.pointerEvents = progress >= 1 ? 'none' : '';
      if (progress >= 1 && !done) {
        done = true;
        document.removeEventListener('wheel', onWheelOrTouch);
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('keydown', onKeydown);
      }
    }

    function consume(e, deltaY) {
      if (done) return;
      if (deltaY > 0 && offset < REVEAL_DISTANCE) {
        e.preventDefault();
        offset = Math.min(REVEAL_DISTANCE, offset + deltaY);
        apply();
      } else if (deltaY < 0 && offset > 0) {
        e.preventDefault();
        offset = Math.max(0, offset + deltaY);
        apply();
      }
    }

    function onWheelOrTouch(e) {
      consume(e, e.deltaY);
    }

    var lastTouchY = null;
    function onTouchStart(e) {
      lastTouchY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      if (lastTouchY === null) return;
      var currentY = e.touches[0].clientY;
      consume(e, lastTouchY - currentY);
      lastTouchY = currentY;
    }

    var SCROLL_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'End', 'Home'];
    function onKeydown(e) {
      if (SCROLL_KEYS.indexOf(e.key) === -1) return;
      var forward = e.key !== 'ArrowUp' && e.key !== 'PageUp';
      consume(e, forward ? 100 : -100);
    }

    apply();
    document.addEventListener('wheel', onWheelOrTouch, { passive: false });
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('keydown', onKeydown, { passive: false });
  }

  // About page: once the hero scroll-scrub has run its course and the
  // visitor has scrolled far enough that Principles reaches the top of
  // the viewport, going back up past that point -- re-entering the hero
  // -- is blocked for the rest of the visit. A one-time intro, not a
  // repeatable scene: reloading the page is the only way to see the hero
  // scrub again. The boundary is exactly the scrollY where Principles
  // first reaches top:0 (the same condition setupAboutSubNav uses to pin
  // the sub-nav), captured once the first time that happens.
  function setupPrinciplesOneWayGate() {
    var principlesSection = document.getElementById('principles');
    if (!principlesSection) return;

    var locked = false;
    var lockScrollY = null;

    // Safety net that catches anything the wheel/touch blocking below
    // misses -- keyboard Home/PageUp and scrollbar-dragging don't fire
    // wheel/touch events, but they do fire 'scroll'. Correcting within
    // the same scroll event that caused it means the browser never gets
    // a chance to paint the disallowed position first.
    function onScroll() {
      if (!locked) {
        if (principlesSection.getBoundingClientRect().top <= 0) {
          locked = true;
          lockScrollY = window.scrollY;
        }
        return;
      }
      if (window.scrollY < lockScrollY) {
        window.scrollTo(0, lockScrollY);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Blocks the common case (wheel/trackpad/touch) before the page ever
    // moves, so pushing up against the gate feels like hitting a wall
    // rather than bouncing back after a visible jump.
    function blocksUpward(deltaY) {
      return locked && deltaY < 0 && window.scrollY <= lockScrollY;
    }
    document.addEventListener(
      'wheel',
      function (e) {
        if (blocksUpward(e.deltaY)) e.preventDefault();
      },
      { passive: false }
    );
    var lastTouchY = null;
    document.addEventListener(
      'touchstart',
      function (e) {
        lastTouchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      function (e) {
        if (lastTouchY === null) return;
        var currentY = e.touches[0].clientY;
        // Matches setupHeroScrollScrub's convention: finger moving up
        // (currentY < lastTouchY) is a positive/"forward" delta, finger
        // moving down is negative/"backward" (toward the hero).
        if (blocksUpward(lastTouchY - currentY)) e.preventDefault();
        lastTouchY = currentY;
      },
      { passive: false }
    );
  }

  // Homepage stacking cards (sticky-nav.css) are clamped to exactly one
  // viewport with overflow:hidden -- plain position:sticky can't reveal a
  // card whose own content is taller than that: sticky freezes the same
  // visible slice for the entire time a card is "stuck", only moving
  // again once nearly the whole excess height has scrolled past, which
  // skips the extra content instead of showing it (confirmed: scrolling
  // ~760px through the stuck Agenda card never advanced past its first
  // row). This drives the reveal manually instead: each tall card's own
  // *content wrapper* (not the section, which stays sticky+clipped) gets
  // translateY'd as the visitor keeps wheeling/touching, consuming that
  // input until the wrapper's bottom has actually been reached -- reading
  // as one continuous scroll gesture, not a nested scrollable region --
  // and only then stepping aside so real page scroll resumes and the next
  // card's cover can begin. Cards whose content already fits in one
  // viewport just report excess<=0 and are left alone.
  function setupTallCardReveal() {
    var configs = [
      { section: '[data-framer-name="DemocracySalons"]', content: '.framer-86nu57' }
      // Journey Section, Agenda, and JOIN US aren't in this list anymore --
      // none of them are clamped to one viewport now (sticky-nav.css), so
      // each one's own full, uncropped height just scrolls past natively
      // before the next card can cover it (setupStackedSectionOffsets),
      // no JS panning/reveal needed.
    ];

    var cards = configs
      .map(function (cfg) {
        var section = document.querySelector(cfg.section);
        var content = section && section.querySelector(cfg.content);
        var extra = cfg.extra ? section && section.querySelector(cfg.extra) : null;
        return section && content ? { section: section, content: content, extra: extra, offset: 0 } : null;
      })
      .filter(Boolean);
    if (!cards.length) return;

    function ownExcess(el) {
      // offsetHeight (not scrollHeight) -- scrollHeight on a <video> just
      // mirrors its own clientHeight (video elements aren't scrollable
      // containers), so it could never register the excess needed to
      // reveal a video that's taller than its clipping wrapper. offsetHeight
      // reflects the element's own rendered size regardless of an
      // ancestor's overflow:hidden, and still matches scrollHeight for the
      // plain div wrappers the other cards use.
      return Math.max(0, el.offsetHeight - window.innerHeight);
    }

    function excessFor(card) {
      // The section holds as long as whichever is tallest -- panned
      // content or the untouched extra element -- still needs revealing.
      var extraExcess = card.extra ? ownExcess(card.extra) : 0;
      return Math.max(ownExcess(card.content), extraExcess);
    }

    function isStuck(card) {
      return Math.abs(card.section.getBoundingClientRect().top) < 1;
    }

    function apply(card) {
      // Clamp the visible pan to the content's own excess -- if the extra
      // element is the taller one, the content finishes panning early and
      // simply holds in place for the remainder of the scroll consumed.
      var panned = Math.min(card.offset, ownExcess(card.content));
      card.content.style.transform = panned ? 'translateY(' + -panned + 'px)' : '';
    }

    function consume(e, deltaY) {
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!isStuck(card)) continue;
        var excess = excessFor(card);
        if (excess <= 0) continue;
        if (deltaY > 0 && card.offset < excess) {
          e.preventDefault();
          card.offset = Math.min(excess, card.offset + deltaY);
          apply(card);
        } else if (deltaY < 0 && card.offset > 0) {
          e.preventDefault();
          card.offset = Math.max(0, card.offset + deltaY);
          apply(card);
        }
        return;
      }
    }

    document.addEventListener(
      'wheel',
      function (e) {
        consume(e, e.deltaY);
      },
      { passive: false }
    );

    var lastTouchY = null;
    document.addEventListener(
      'touchstart',
      function (e) {
        lastTouchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      function (e) {
        if (lastTouchY === null) return;
        var currentY = e.touches[0].clientY;
        consume(e, lastTouchY - currentY);
        lastTouchY = currentY;
      },
      { passive: false }
    );

    window.addEventListener(
      'resize',
      function () {
        cards.forEach(function (card) {
          var excess = excessFor(card);
          if (card.offset > excess) {
            card.offset = excess;
            apply(card);
          }
        });
      },
      { passive: true }
    );
  }

  // The Movement card's (Journey Section) text -- label, heading+arrow,
  // paragraph+link -- gets a one-time staged reveal once the card
  // scrolls into view, rather than all appearing at once: the card fades
  // in, then the heading slides in from the left together with the arrow
  // directly beneath it, then the paragraph and its "read more" link
  // slide up. Each stage's timing lives in sticky-nav.css as a
  // transition-delay off the single .demcon-movement-revealed class this
  // toggles -- one JS trigger, not several timers. Framer's own baked
  // inline opacity:0/translateY(40px) on these elements (meant for its
  // own generic scroll-reveal, which never reliably fires for the arrow
  // -- see the CSS comment) is cleared first so the stylesheet has sole
  // control. getBoundingClientRect-on-scroll, not IntersectionObserver
  // (proved unreliable elsewhere in this file -- see setupScrollReveal).
  function setupMovementReveal() {
    var section = document.querySelector('[data-framer-name="Journey Section"]');
    var card = section && section.querySelector('.framer-lnr63p');
    if (!section || !card) return;

    Array.prototype.forEach.call(
      card.querySelectorAll('.framer-wcxrxy, .framer-hvsa7k, .framer-e571rj, .framer-fobxvj'),
      function (el) {
        el.style.opacity = '';
        el.style.transform = '';
      }
    );

    card.classList.add('demcon-movement-card');

    function checkReveal() {
      // Journey Section scrolls through normally (auto height, no clamp)
      // before locking into its final pinned position -- checking the
      // card's own "is it anywhere near the viewport" rect fired while
      // the section was still scrolling into place, well before the
      // visitor had actually arrived at it. Wait for the section itself
      // to reach its settled/stuck position instead (same math
      // setupStackedSectionOffsets uses: top = min(0, vh - height)),
      // same fix already applied to the Contact CTA reveal.
      var expectedStuckTop = Math.min(0, window.innerHeight - section.offsetHeight);
      var rect = section.getBoundingClientRect();
      var nearlyStuck = Math.abs(rect.top - expectedStuckTop) < 150;
      if (!nearlyStuck) return;
      card.classList.add('demcon-movement-revealed');
      window.removeEventListener('scroll', checkReveal);
      window.removeEventListener('resize', checkReveal);
    }

    checkReveal();
    window.addEventListener('scroll', checkReveal, { passive: true });
    window.addEventListener('resize', checkReveal, { passive: true });
  }

  // Contact CTA section (index.html): the background "paints in" as a
  // soft-edged diagonal sweep (more like a brush stroke than a hard
  // mechanical wipe -- a plain top-to-bottom clip-path edge also read as
  // "not painting in at all" against this particular image, since its
  // top is mostly flat yellow sky that matches the site's own yellow
  // brand color elsewhere, so revealing top-first barely looked like
  // anything changed until the wipe was most of the way done), then the
  // card fades in half a second after that finishes. This used to be a
  // fixed-duration CSS transition kicked off by a one-shot inView check,
  // but any fixed timer is wrong here regardless of when it starts: a
  // fast scroll blows past it before it finishes, a slow scroll leaves
  // it sitting fully-revealed long before the visitor actually arrives.
  // Instead this scrubs a mask-image gradient directly off scroll
  // position (a CSS custom property, no transition), so the sweep is
  // locked 1:1 to the visitor's own scrolling: reveal progress is 0%
  // right as the section's top reaches the viewport's bottom edge and
  // 100% once the section is fully arrived (top:0 in the viewport).
  // Only once it's fully revealed does .demcon-contact-revealed get
  // added, which is what the card's own (separately timed, half-second)
  // fade-in transition keys off in sticky-nav.css.
  function setupContactCtaReveal() {
    var section = document.querySelector('.demcon-contact-cta-section');
    var card = section && section.querySelector('.demcon-contact-cta-card');
    if (!section || !card) return;

    var revealed = false;

    function update() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight;
      var start = vh; // rect.top when the wipe should be 0% done
      var end = 0; // rect.top when the wipe should be 100% done
      var progress = (start - rect.top) / (start - end);
      progress = Math.max(0, Math.min(1, progress));
      // The background wipe itself stays live-scrubbed both directions
      // (scrolling back up "unpaints" it, which is fine for a
      // scroll-linked effect) -- but the card's reveal is a one-shot: it
      // only ever gets added, never removed, matching every other
      // entrance animation in this file. Without that, scrolling back up
      // even slightly re-hid the card and reset its (delayed) fade-in,
      // so it only ever looked "done" once scrolling stopped for good at
      // the bottom of the page.
      section.style.setProperty('--demcon-reveal-progress', progress * 100 + '%');
      // >= 0.98, not a strict 1 -- sub-pixel scroll rounding means rect.top
      // can land at e.g. 0.03px instead of exactly 0, which would silently
      // never satisfy an exact-equality check.
      if (progress >= 0.98 && !revealed) {
        revealed = true;
        section.classList.add('demcon-contact-revealed');
      }
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  // Plain position:sticky with top:0 pins a section the instant it reaches
  // the viewport top, freezing whatever slice is visible right then -- for
  // a section taller than one viewport (Journey Section, sized to its
  // video's natural height), that means only the TOP portion ever gets
  // shown while stuck, and the rest only becomes visible once the next
  // card is already sliding up to cover it. Giving a tall section a
  // *negative* top offset instead (equal to viewport height minus its own
  // height) delays when it catches: it keeps scrolling normally -- reading
  // top to bottom like ordinary content -- for that extra distance first,
  // and only locks in place once its own bottom has actually reached the
  // viewport's bottom, so the next card can't start covering it until
  // it's been scrolled through in full. Sections that already fit in one
  // viewport get an offset of 0 (a no-op), so this is safe to apply to all
  // of them uniformly.
  function setupStackedSectionOffsets() {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll(
        '.demcon-home-page [data-framer-name="DemocracySalons"], ' +
        '.demcon-home-page [data-framer-name="Journey Section"], ' +
        '.demcon-home-page [data-framer-name="Agenda"], ' +
        '.demcon-home-page [data-framer-name="Speakers - Section"], ' +
        '.demcon-home-page [data-framer-name="Participation"], ' +
        '.demcon-home-page [data-framer-name="JOIN US"], ' +
        '.demcon-about-page .framer-tuaoj3, ' +
        '.demcon-about-page .demcon-principles-section, ' +
        '.demcon-about-page .framer-1rbxc9t, ' +
        '.demcon-about-page .framer-13wosc3'
      )
    );
    if (!sections.length) return;

    function adjust() {
      var vh = window.innerHeight;
      sections.forEach(function (el) {
        el.style.top = Math.min(0, vh - el.offsetHeight) + 'px';
      });
    }

    adjust();
    window.addEventListener('resize', adjust, { passive: true });
    window.addEventListener('load', adjust);

    // About page only: every card in this stack sits inside a Framer
    // `display:contents` variant-switching wrapper, which means the
    // browser resolves each one's position:sticky "containing block" as
    // the *entire* surrounding flex container rather than just its own
    // box. Native sticky release never actually happens as a result --
    // releasing only the last (highest z-index) card just exposes the
    // same bug one layer down (the second-to-last card, still stuck
    // forever, shows through in its place instead of the footer). All of
    // them need to release at once, at the moment the whole stack ends
    // and the footer should take over -- re-pinning all of them if
    // scrolled back up. Scoped to the about page only -- the homepage's
    // stack doesn't get this treatment.
    if (document.body.classList.contains('demcon-about-page')) {
      var footer = document.querySelector('footer');
      var footerNaturalTop = null;
      var stackReleased = null;

      function updateStackRelease() {
        if (!footer) return;
        var vh = window.innerHeight;
        if (footerNaturalTop == null) {
          footerNaturalTop = footer.getBoundingClientRect().top + window.scrollY;
        }
        var past = window.scrollY >= footerNaturalTop - vh;
        if (stackReleased === past) return;
        stackReleased = past;
        sections.forEach(function (el) {
          if (past) {
            // z-index keeps applying to position:relative just as it did
            // to sticky, so releasing the position alone still leaves
            // these painting over the footer -- drop the z-index too.
            el.style.position = 'relative';
            el.style.top = '';
            el.style.zIndex = 'auto';
          } else {
            el.style.position = '';
            el.style.zIndex = '';
            el.style.top = Math.min(0, vh - el.offsetHeight) + 'px';
          }
        });
      }

      updateStackRelease();
      window.addEventListener('resize', function () {
        footerNaturalTop = null;
        stackReleased = null;
        updateStackRelease();
      }, { passive: true });
      window.addEventListener('scroll', updateStackRelease, { passive: true });
    }

    // The video's real rendered height (which Journey Section's own
    // height depends on, now that it's sized to match it) isn't known
    // until its metadata loads, which can happen after the above -- so
    // this one card also gets an extra recompute once that's ready.
    var video = document.querySelector('[data-framer-name="Journey Section"] .framer-17um2q1 video');
    if (video) video.addEventListener('loadedmetadata', adjust);

    return adjust;
  }

  // This script is loaded with `defer`, which already guarantees the DOM is
  // fully parsed by the time it runs.
  init();
  addReadMoreLink();
  setupHeroSubscribeButton();
  enhanceButtons();
  setupCustomCursor();
  setupHeroIntro();
  setupHeroFade();
  setupScrollReveal();
  setupMarquee();
  setupAboutSubNav();
  setupAgendaHover();
  setupAgendaAccordion();
  setupCtaButtonHover();
  setupTypewriter();
  setupTextScrollReveal();
  setupTallCardReveal();
  setupMovementReveal();
  setupContactCtaReveal();
  var adjustStackedSections = setupStackedSectionOffsets();
  setupPrinciplesToggle(adjustStackedSections);
  setupPrinciplesTabs(adjustStackedSections);
  setupUDHRSequence();
  setupPrinciplesOneWayGate();
})();
