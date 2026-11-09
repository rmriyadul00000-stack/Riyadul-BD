/* Applies every logo setting saved in Admin -> Settings -> Logo studio to the storefront.
   Include this on your shop pages AFTER supabase.js, then call:

       RB_DB.settings().then(r => rbApplyLogo(r.data));

   It finds the logo <img> by these selectors (edit LOGO_SELECTOR to match your header markup):
*/
const LOGO_SELECTOR = '[data-site-logo], .site-logo img, .logo img, .brand img, header .logo, header .brand img';

function rbApplyLogo(s, root) {
  s = s || {};
  const imgs = (root || document).querySelectorAll(LOGO_SELECTOR);
  const h = parseInt(s.logo_height, 10) || 40;
  const w = parseInt(s.logo_width, 10) || 0;          // 0 / empty = auto (keep proportions)
  const fit = s.logo_fit === 'cover' ? 'cover' : 'contain';
  const shape = s.logo_shape || 'none';
  imgs.forEach(img => {
    if (s.logo_url) img.src = s.logo_url;
    img.style.height = h + 'px';
    img.style.maxWidth = 'none';                       // stops theme CSS capping the width
    img.style.width = shape === 'circle' ? h + 'px' : (w ? w + 'px' : 'auto');
    img.style.objectFit = shape === 'circle' ? 'cover' : fit;
    img.style.borderRadius = shape === 'circle' ? '50%' : shape === 'rounded' ? '10px' : '0';
    img.style.overflow = 'hidden';
  });
}
