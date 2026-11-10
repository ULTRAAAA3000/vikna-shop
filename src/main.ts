import '@fontsource-variable/unbounded/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './styles.css';
import { initHeader, initReveal, initHero, initCounters } from './ui';
import { initProducts } from './products';
import { initPrices } from './prices';
import { initOrderForm } from './order-form';
import { initConfigurator } from './configurator/panel';

document.querySelectorAll<HTMLElement>('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));

initHeader();
initHero();
initProducts();
initPrices();
initConfigurator();
initOrderForm();
// Блоки, створені скриптами, мають бути в DOM до ініціалізації появи
initReveal();
initCounters();
