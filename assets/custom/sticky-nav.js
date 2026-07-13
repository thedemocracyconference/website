(function () {
  var HEADER_SELECTOR = '.framer-1kfysrm-container';
  var SECTION_IDS = ['about', 'salons', 'agenda', 'speakers'];

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
    var FORCED_SECTIONS = [
      { selector: '#speakers', bucket: 'yellow' },
      { selector: '[data-framer-name="Participation"]', bucket: 'black' }
    ];

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

    var links = Array.prototype.slice.call(header.querySelectorAll('a.framer-YmthU'));
    var linksByHash = {};
    links.forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var url;
      try {
        url = new URL(href, window.location.href);
      } catch (e) {
        return;
      }
      var hash = url.hash.replace('#', '');
      if (!hash) return;
      if (!linksByHash[hash]) linksByHash[hash] = [];
      linksByHash[hash].push(link);
    });

    // Cross-page links (e.g. Contact) get a permanent underline when they point at the current page.
    links.forEach(function (link) {
      if (link.hasAttribute('data-framer-page-link-current')) {
        link.classList.add('demcon-nav-active');
      }
    });

    var sections = [];
    SECTION_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      var sectionLinks = linksByHash[id];
      if (!el || !sectionLinks) return;
      sections.push({ id: id, el: el, links: sectionLinks });

      sectionLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var top = el.getBoundingClientRect().top + window.pageYOffset - getHeaderHeight() - 8;
          window.scrollTo({ top: top, behavior: 'smooth' });
          if (history.pushState) history.pushState(null, '', '#' + id);
        });
      });
    });

    if (!sections.length) return;

    function setActive(id) {
      sections.forEach(function (s) {
        s.links.forEach(function (link) {
          link.classList.toggle('demcon-nav-active', s.id === id);
        });
      });
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-' + Math.round(getHeaderHeight() + 8) + 'px 0px -60% 0px', threshold: 0 }
    );

    sections.forEach(function (s) {
      observer.observe(s.el);
    });
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
    enhanceButtons();
    setupCustomCursor();
  } else {
    window.addEventListener('load', function () {
      init();
      enhanceButtons();
      setupCustomCursor();
    });
  }
})();
