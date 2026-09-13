/* Host bio modal for the Democracy Salons page.

   A duplicate of the homepage's "Our Hosts" modal (initHostBioModal in
   assets/custom/sticky-nav.js), so "About Hunter" / "About Lindsey" here
   open the same thing they open there. This page deliberately does not load
   sticky-nav.js -- it is ~3,500 lines of homepage-specific behaviour -- so
   the modal is duplicated instead of shared.

   HOST_DATA and SOCIAL_ICONS below were extracted verbatim from that file
   rather than retyped, so the bios, links and icon paths are identical.
   sticky-nav.js remains the source of truth: if a bio changes there, it
   must be changed here too. */
(function () {
  'use strict';

  var HOST_DATA = {
      lindsey: {
        name: 'Lindsey Brock Morales',
        title: 'Editor-in-Chief, The Parlor Magazine',
        titleColor: '#ff0074',
        photo: '/assets/images/hosts/lindsey-brock-morales.png',
        bio:
          'Lindsey Brock Morales is the Editor-in-Chief of The Parlor Magazine, an independent, globally minded magazine built on the belief that the people most affected by power are the most qualified to describe it — nonprofit, independent, and accountable to no advertiser, no algorithm, and no imperial center.',
        link: 'https://theparlormagazine.com',
        socials: [
          { label: 'Instagram', href: 'https://www.instagram.com/the_parlor_magazine?igsh=amsyOW1oM2pnMDRn&utm_source=qr' },
          { label: 'TikTok', href: 'https://www.tiktok.com/@the_parlor_magazine?_r=1&_t=ZT-98925DA2kTV' },
          { label: 'Facebook', href: 'https://www.facebook.com/share/1DYmoVELv8/?mibextid=wwXIfr' },
          { label: 'LinkedIn', href: 'https://www.linkedin.com/company/the-parlor-mag/' }
        ]
      },
      hunter: {
        name: 'Hunter Christopher',
        title: 'Host, roterotecast',
        // Matches his photo's own background blue (sampled directly from the
        // source image) rather than the site's default hot-pink title color.
        titleColor: '#02b5fe',
        photo: '/assets/images/hosts/hunter-christopher.png',
        bio:
          'Hunter Christopher is the host of roterotecast, a leftie politics show focusing on European politics, democracy, and fighting the far right.',
        link: 'https://www.roterotemedia.com',
        socials: [
          { label: 'Instagram', href: 'https://www.instagram.com/roterotemedia?igsh=MXQzNTE5cjJ0MDJheQ==' },
          { label: 'TikTok', href: 'https://www.tiktok.com/@roterotemedia?_r=1&_t=ZT-9892Ko3zn14' }
        ]
      }
    };

  var SOCIAL_ICONS = {
      Instagram:
        '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.332.014 7.052.072 2.694.272.273 2.69.073 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.332 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>',
      TikTok:
        '<path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
      Facebook:
        '<path d="M22.675 0h-21.35C.6 0 0 .6 0 1.325v21.351C0 23.4.6 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.098 2.795.142v3.24h-1.918c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.4 24 24 23.4 24 22.676V1.325C24 .6 23.4 0 22.675 0z"/>',
      LinkedIn:
        '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667h-3.554V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.56V9h3.554v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/>'
    };

  var modal = document.getElementById('demcon-host-modal');
  var triggers = document.querySelectorAll('[data-host]');
  if (!modal || !triggers.length) return;

  var dialog = modal.querySelector('.demcon-modal-dialog');
  var photo = modal.querySelector('.demcon-host-modal-photo');
  var name = modal.querySelector('.demcon-host-modal-name');
  var title = modal.querySelector('.demcon-host-modal-title');
  var socials = modal.querySelector('.demcon-host-modal-socials');
  var bio = modal.querySelector('.demcon-host-modal-bio');
  var link = modal.querySelector('.demcon-host-modal-link');
  var focusableSelector = 'button, [href], [tabindex]:not([tabindex="-1"])';
  var lastFocused = null;

  function isOpen() { return !modal.hidden; }

  function open(hostId) {
    var data = HOST_DATA[hostId];
    if (!data) return;
    photo.src = data.photo;
    photo.alt = data.name;
    name.textContent = data.name;
    title.textContent = data.title;
    title.style.color = data.titleColor || '';
    link.href = data.link;

    socials.innerHTML = '';
    (data.socials || []).forEach(function (s) {
      var a = document.createElement('a');
      a.className = 'demcon-host-modal-social';
      a.href = s.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', s.label);
      a.title = s.label;
      var iconPath = SOCIAL_ICONS[s.label];
      if (iconPath) {
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + iconPath + '</svg>';
      } else {
        a.textContent = s.label;
      }
      socials.appendChild(a);
    });

    // textContent, not innerHTML -- nothing in a bio should ever be parsed
    // as markup.
    bio.textContent = data.bio;

    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('.demcon-modal-close').focus();
  }

  function close() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  Array.prototype.forEach.call(triggers, function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open(el.getAttribute('data-host'));
    });
  });

  modal.querySelectorAll('[data-modal-dismiss]').forEach(function (el) {
    el.addEventListener('click', close);
  });

  // Escape closes; Tab is trapped inside the dialog while it is open.
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(dialog.querySelectorAll(focusableSelector));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
})();
