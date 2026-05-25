/* ============================================================
 *  HIMARK · IMAGE MANIFEST
 * ============================================================
 *
 *  Single source of truth for image paths used across the site.
 *  Edit any value below to swap an image everywhere it is used —
 *  save the file, refresh any page, the new image appears.
 *
 *  ─────────────────────────────────────────────────────
 *  HOW TO USE
 *  ─────────────────────────────────────────────────────
 *
 *  • To CHANGE an image: edit the path in the IMAGES object below.
 *      Example:
 *        'hero.about': 'images/my-new-about-hero.jpg'
 *
 *  • To ADD an image: drop the file into the /images directory,
 *      then add a new line to the IMAGES object pointing to it.
 *      Example:
 *        'hero.intake.bg': 'images/intake-backdrop.jpg'
 *
 *  • To USE the new image in HTML, reference its key on the element:
 *        Background image:  <div data-bg-key="hero.intake.bg"></div>
 *        <img> tag:         <img data-img-key="hero.intake.bg" />
 *
 *      The loader at the bottom of this file will pick it up.
 *
 *  ─────────────────────────────────────────────────────
 *  PATHS
 *  ─────────────────────────────────────────────────────
 *  All paths are relative to the site root.
 *  e.g. 'images/my-image.jpg' resolves to /images/my-image.jpg
 *
 *  ============================================================ */

window.HIMARK_IMAGES = {

  /* ─── HERO BACKGROUNDS ──────────────────────────────
     The full-bleed image at the top of each content page. */
  'hero.about'    : 'images/about-hero.jpg',
  'hero.apply'    : 'images/apply-hero.jpg',
  'hero.contact'  : 'images/apply-hero.jpg',
  'hero.insights' : 'images/about-hero.jpg',
  'hero.process'  : 'images/method-hero.jpg',
  'hero.product'  : 'images/airass-hero.jpg',
  'hero.services' : 'images/mandates-hero.jpg',
  'hero.sessions' : 'images/apply-hero.jpg',
  'hero.press'    : 'images/team-hero.jpg',
  'hero.team'     : 'images/team-hero.jpg',
  'hero.work'     : 'images/mandates-hero.jpg',

  /* ─── SESSIONS PAGE CAROUSEL ────────────────────────
     Three slides in the intro carousel on /sessions.html */
  'sessions.slide.1' : 'images/about-hero.jpg',
  'sessions.slide.2' : 'images/team-hero.jpg',
  'sessions.slide.3' : 'images/method-hero.jpg',

  /* ─── HOME ORBIT — SIDE IMAGES ──────────────────────
     The two vertical images that slide in when the home page
     orbit collapses. Each is a clickable nav into another page. */
  'orbit.side.left'  : 'images/method-hero.jpg',
  'orbit.side.right' : 'images/team-hero.jpg'

  /* Add more entries above this line, with a trailing comma on
     the previous entry. Keep this comment at the bottom. */

};

/* ============================================================
 *  LOADER  —  do not edit unless you know what you're doing.
 *
 *  At page-ready, this loader walks the DOM and applies any
 *  manifest paths to elements carrying a data-bg-key or
 *  data-img-key attribute. The inline `style=...` and `src=...`
 *  already on those elements act as fallbacks so the page
 *  renders correctly even if JavaScript is disabled.
 * ============================================================ */
(function(){
  function apply(){
    var m = window.HIMARK_IMAGES || {};

    // <div data-bg-key="key"> → sets background-image
    var bgs = document.querySelectorAll('[data-bg-key]');
    for (var i = 0; i < bgs.length; i++) {
      var k = bgs[i].getAttribute('data-bg-key');
      if (m[k]) bgs[i].style.backgroundImage = "url('" + m[k] + "')";
    }

    // <img data-img-key="key"> → sets src
    var imgs = document.querySelectorAll('img[data-img-key]');
    for (var j = 0; j < imgs.length; j++) {
      var kk = imgs[j].getAttribute('data-img-key');
      if (m[kk]) imgs[j].src = m[kk];
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
