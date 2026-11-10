/* Storefront entry. One module graph for every public page; the
   <body data-page="…"> attribute picks the controller. */
import './core.js';
import { startPage } from './pages.js';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPage, { once: true });
else startPage();
