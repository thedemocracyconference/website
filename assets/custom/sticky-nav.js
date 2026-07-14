(function () {
  var HEADER_SELECTOR = '.framer-1kfysrm-container';
  var SECTION_IDS = ['about', 'salons', 'agenda', 'participate'];

  // Framer's own modal/overlay (triggered by the Register button) is a
  // fixed, dark-backdrop element carrying one of these variant classes
  // (confirmed via devtools: framer-BkS23.framer-19g2khz for the backdrop,
  // framer-fjgp47/wrkpcx for the centered content wrapper). framer-BkS23
  // itself is a reused base class shared by many elements, not a unique
  // root id, so it must be matched together with the variant class.
  var MODAL_SELECTOR = [
    '.framer-BkS23.framer-1vqj38j',
    '.framer-BkS23.framer-19g2khz',
    '.framer-BkS23.framer-1hszaju',
    '.framer-BkS23.framer-fjgp47',
    '.framer-BkS23.framer-wrkpcx'
  ].join(', ');

  function isModalOpen() {
    return !!document.querySelector(MODAL_SELECTOR);
  }

  // The "Join Us" overlay's whole markup (heading, fields, button) is
  // generated entirely by React at runtime -- it never appears in the
  // static HTML, so there's nothing to edit there. Insert a clarifying
  // newsletter note into the empty space in the dark left panel, right
  // after the "DEMCON 2027" heading (framer-l5ua6f/cohij2 are that
  // heading's desktop/mobile wrapper classes, found by reading the
  // component source in script_main.mjs).
  function setupNewsletterNote() {
    var NOTE_TEXT =
      "By signing up for our newsletter you’ll be the first to know when ticket sales and the speaker lineup go live.";

    function inject() {
      if (!isModalOpen()) return;
      if (document.querySelector('.demcon-newsletter-note')) return;
      var target = document.querySelector('.framer-l5ua6f, .framer-cohij2');
      if (!target) return;
      var note = document.createElement('p');
      note.className = 'demcon-newsletter-note';
      note.textContent = NOTE_TEXT;
      target.insertAdjacentElement('afterend', note);
    }

    inject();
    new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  }

  function pinHeader(header, nav) {
    var targets = [header, nav].filter(Boolean);
    function tick() {
      var hide = isModalOpen();
      targets.forEach(function (el) {
        if (hide) {
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
          return;
        }
        el.style.removeProperty('pointer-events');
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('top', '0px', 'important');
        el.style.setProperty('left', '0px', 'important');
        el.style.setProperty('right', '0px', 'important');
        el.style.setProperty('transform', 'none', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
      });
      requestAnimationFrame(tick);
    }
    tick();
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

    var ticking = false;
    function check() {
      ticking = false;
      var y = Math.round(getHeaderHeight() + 4);
      var bucket = forcedBucket(y) || nearestBucket(averageBackgroundColor(y));
      applyBucket(bucket);
    }

    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(check);
        }
      },
      { passive: true }
    );
    window.addEventListener('resize', check);

    check();
  }

  // React hydration re-renders the nav from Framer's own (original-order)
  // component tree shortly after first paint, clobbering our static HTML
  // reorder of the About/Salons links. It replaces the actual DOM nodes
  // (not just their position), so cached element references go stale --
  // re-query fresh on every mutation, and observe a stable ancestor with
  // subtree:true in case the whole "Menu List" wrapper gets replaced too.
  function keepSalonsBeforeAbout(header) {
    var enforcing = false;

    function enforce() {
      if (enforcing) return;
      var aboutLink = header.querySelector('a[href*="#about"]');
      var salonsLink = header.querySelector('a[href*="#salons"]');
      if (!aboutLink || !salonsLink) return;
      var aboutContainer = aboutLink.parentElement;
      var salonsContainer = salonsLink.parentElement;
      var parent = aboutContainer && aboutContainer.parentElement;
      if (!parent || salonsContainer.parentElement !== parent) return;
      if (aboutContainer.compareDocumentPosition(salonsContainer) & Node.DOCUMENT_POSITION_FOLLOWING) {
        enforcing = true;
        try {
          parent.insertBefore(salonsContainer, aboutContainer);
        } catch (e) {}
        enforcing = false;
      }
    }

    enforce();
    new MutationObserver(enforce).observe(header, { childList: true, subtree: true });
  }

  // Same hydration issue as the nav order: force the Navbar Button's label
  // to "JOIN US" and keep re-asserting it if Framer resets it to "REGISTER".
  function keepJoinUsLabel(header) {
    function enforce() {
      var button = header.querySelector('[data-framer-name="Navbar Button"]');
      if (!button) return;
      var label = button.querySelector('p');
      if (label && label.textContent.trim() === 'REGISTER') {
        label.textContent = 'JOIN US';
      }
    }
    enforce();
    new MutationObserver(enforce).observe(header, { childList: true, subtree: true, characterData: true });
  }

  // Same hydration issue again: the Speakers link was swapped for a
  // Participate link (pointing at the Participation section instead, since
  // the speaker lineup isn't public yet) -- keep re-asserting both the
  // label and the href if Framer resets them.
  function keepParticipateLabel(header) {
    function enforce() {
      var links = header.querySelectorAll('a.framer-YmthU');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        var label = links[i].querySelector('p');
        if (!label) continue;
        if (href.indexOf('#speakers') !== -1) {
          links[i].setAttribute('href', href.replace('#speakers', '#participate'));
        }
        if (label.textContent.trim() === 'SPEAKERS') {
          label.textContent = 'PARTICIPATE';
        }
      }
    }
    enforce();
    new MutationObserver(enforce).observe(header, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  function init() {
    var header = document.querySelector(HEADER_SELECTOR);
    if (!header) return;
    var nav = header.querySelector('nav');

    // The wrapper sizes itself from its in-flow child; pinning the nav to
    // position:fixed takes it out of flow, so the wrapper's own rect
    // collapses to 0 height. Always measure the nav for real dimensions.
    function getHeaderHeight() {
      return (nav || header).getBoundingClientRect().height;
    }

    pinHeader(header, nav);
    watchHeaderContrast(header, getHeaderHeight);
    keepSalonsBeforeAbout(header);
    keepJoinUsLabel(header);
    keepParticipateLabel(header);

    // Links are looked up fresh every time, by hash, rather than cached once
    // at init(). Hydration-triggered fixes elsewhere (Participate's label,
    // for instance) can cause React to replace a link's DOM node entirely;
    // a cached reference would then point at a detached, invisible node,
    // silently breaking both its click-to-scroll and its active underline.
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

    // "participate" has no real id in the DOM -- a hand-added id attribute
    // doesn't survive hydration the way Framer's own authored about/salons/
    // agenda ids do, so it's looked up the same way FORCED_SECTIONS finds
    // it: by its stable data-framer-name.
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

    // The active id is kept here and continuously re-applied (on scroll,
    // after clicks, and whenever the nav's DOM changes) rather than set
    // once per scroll event. Framer's native per-link hover behavior swaps
    // in a different DOM node on hover/mouse-leave (its own onMouseEnter
    // handler + data-highlight system), which would otherwise silently
    // carry away our class and never restore it.
    var currentActiveId = null;

    function applyActiveState() {
      currentLinks().forEach(function (link) {
        link.classList.toggle('demcon-nav-active', currentActiveId !== null && linkHash(link) === currentActiveId);
      });
    }

    function setActive(id) {
      currentActiveId = id;
      applyActiveState();
    }

    new MutationObserver(applyActiveState).observe(header, { childList: true, subtree: true });

    // Event delegation: one listener on the header handles clicks on
    // whichever link element currently exists for each hash, so a node
    // swap never leaves a stale handler bound to a detached element.
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

    // React hydration restores this paragraph's original text from
    // Framer's own component data, wiping a static-HTML edit. Append the
    // Brussels sentence here at runtime instead, same as the nav-order fix,
    // and keep re-asserting it via MutationObserver in case hydration
    // touches this text again later.
    var brusselsNote = ' Held in Brussels, the capital of the EU.';
    function ensureBrusselsNote() {
      if (target.textContent.indexOf('Brussels, the capital of the EU') === -1) {
        target.appendChild(document.createTextNode(brusselsNote));
      }
    }
    ensureBrusselsNote();
    new MutationObserver(ensureBrusselsNote).observe(target, { childList: true, characterData: true, subtree: true });

    // .framer-fobxvj wraps the paragraph in a plain (non-flex) block, so
    // appending inside it -- rather than as a sibling in the flex "Text"
    // row above -- stacks it under the text instead of getting spread
    // across the row by the parent's justify-content:space-between.
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

  // Grow real "buttons" (filled or bordered clickable elements) on hover.
  // Plain underlined text links and the nav menu items (handled separately)
  // are left alone.
  function enhanceButtons() {
    var header = document.querySelector(HEADER_SELECTOR);
    var candidates = Array.prototype.slice.call(document.querySelectorAll('a, button'));
    candidates.forEach(function (el) {
      if (header && header.contains(el)) return;
      var cs = getComputedStyle(el);
      if (cs.cursor !== 'pointer') return;
      var hasBorder = el.getAttribute('data-border') === 'true';
      var bg = cs.backgroundColor;
      var hasFill = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (!hasBorder && !hasFill) return;
      el.classList.add('demcon-hover-grow');
    });
  }

  // Replace the native pointer with an enlarged custom arrow cursor while
  // hovering a button, instead of the OS hand/pointer icon. The site's own
  // click-burst effect (a global document "click" listener with no target
  // exclusions) keeps working underneath since we never block the event.
  function setupCustomCursor() {
    var cursorEl = document.createElement('div');
    cursorEl.className = 'demcon-custom-cursor';
    cursorEl.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 15.2 L10.4 21.6 L13.2 20.3 L10.4 14 L16.5 14 Z" fill="#030509" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursorEl);

    document.addEventListener(
      'mousemove',
      function (e) {
        cursorEl.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
        var overButton = e.target.closest && e.target.closest('.demcon-hover-grow');
        cursorEl.classList.toggle('demcon-custom-cursor-visible', !!overButton);
      },
      { passive: true }
    );
  }

  if (document.readyState === 'complete') {
    init();
    addReadMoreLink();
    enhanceButtons();
    setupCustomCursor();
    setupNewsletterNote();
  } else {
    window.addEventListener('load', function () {
      init();
      addReadMoreLink();
      enhanceButtons();
      setupCustomCursor();
      setupNewsletterNote();
    });
  }
})();
