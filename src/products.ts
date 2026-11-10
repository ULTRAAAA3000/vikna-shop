import { PRODUCTS, PRODUCT_ORDER, type ProductKind, formatUah } from '../shared/catalog';
import { requestConfigure } from './store';
import { scrollToId } from './ui';

const stroke = 'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const glass = 'fill="rgba(111,176,220,.28)"';

const ICONS: Record<ProductKind, string> = {
  window: `<svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <rect x="14" y="8" width="92" height="84" rx="4" ${stroke} fill="#fff"/>
    <rect x="22" y="16" width="36" height="68" ${stroke} ${glass}/>
    <rect x="62" y="16" width="36" height="68" ${stroke} ${glass}/>
    <path d="M22 16l36 34-36 34M98 16L62 50l36 34" stroke="#ff7a1a" stroke-width="2.2" stroke-dasharray="4 4" stroke-linecap="round"/>
    <path d="M54 46v8M66 46v8" ${stroke}/></svg>`,
  balcony: `<svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <rect x="10" y="6" width="100" height="90" rx="4" ${stroke} fill="#fff"/>
    <rect x="18" y="14" width="40" height="74" ${stroke} ${glass}/>
    <rect x="62" y="14" width="40" height="40" ${stroke} ${glass}/>
    <rect x="62" y="58" width="40" height="30" ${stroke} fill="rgba(15,26,43,.08)"/>
    <path d="M58 14L18 51l40 37" stroke="#ff7a1a" stroke-width="2.2" stroke-dasharray="4 4" stroke-linecap="round"/>
    <path d="M52 46v10" ${stroke}/></svg>`,
  entrance: `<svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <rect x="30" y="4" width="60" height="92" rx="4" ${stroke} fill="#fff"/>
    <rect x="38" y="12" width="44" height="34" ${stroke} ${glass}/>
    <rect x="38" y="52" width="44" height="36" ${stroke} fill="rgba(15,26,43,.1)"/>
    <path d="M76 50v-4" ${stroke}/><circle cx="76" cy="68" r="2.6" fill="#ff7a1a"/>
    <path d="M44 62h32M44 74h32" stroke="currentColor" stroke-width="1.6" opacity=".4" stroke-linecap="round"/></svg>`,
  sliding: `<svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <rect x="6" y="10" width="108" height="80" rx="4" ${stroke} fill="#fff"/>
    <rect x="12" y="16" width="32" height="68" ${stroke} ${glass}/>
    <rect x="44" y="16" width="32" height="68" ${stroke} ${glass}/>
    <rect x="76" y="16" width="32" height="68" ${stroke} ${glass}/>
    <path d="M30 50h22M46 44l6 6-6 6" stroke="#ff7a1a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const COPY: Record<ProductKind, { title: string; text: string; specs: string[] }> = {
  window: {
    title: 'Вікна',
    text: 'Глухі, поворотні та поворотно-відкидні. Прямокутні й арочні, від 0,4 до 3 м.',
    specs: ['Профіль 60–82 мм, 3–7 камер', 'Склопакети до 44 мм, i-скло', 'Ламінація: дерево, антрацит, чорний'],
  },
  balcony: {
    title: 'Балконні двері',
    text: 'Двері та блоки «двері + вікно» для балконів, лоджій і терас.',
    specs: ['Низький поріг і посилена фурнітура', 'Комбінації з глухими та відкритими вставками', 'Мікропровітрювання в одну дію'],
  },
  entrance: {
    title: 'Вхідні двері',
    text: 'Теплі й міцні вхідні групи для квартир, будинків та офісів.',
    specs: ['Скло, панель або комбіноване заповнення', 'Багатоточкове замикання', 'Посилений профіль зі сталевим армуванням'],
  },
  sliding: {
    title: 'Розсувні системи',
    text: 'Панорамні портали для терас, веранд і вітальень до 5,6 м шириною.',
    specs: ['2, 3 або 4 стулки', 'Рейка з мінімальним порогом', 'Плавний хід, замок на ручці'],
  },
};

export function initProducts(): void {
  const root = document.querySelector<HTMLElement>('[data-products]');
  if (!root) return;

  root.innerHTML = PRODUCT_ORDER.map((id) => {
    const c = COPY[id];
    return `<article class="card reveal">
      <div class="card-art">${ICONS[id]}</div>
      <div class="card-body">
        <h3>${c.title}</h3>
        <p>${c.text}</p>
        <ul class="specs">${c.specs.map((s) => `<li>${s}</li>`).join('')}</ul>
        <div class="card-foot">
          <div><small>від</small><strong>${formatUah(PRODUCTS[id].baseM2)}/м²</strong></div>
          <button class="btn btn-dark btn-sm" type="button" data-product="${id}">Налаштувати</button>
        </div>
      </div>
    </article>`;
  }).join('');

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-product]');
    if (!btn) return;
    requestConfigure(btn.dataset.product as ProductKind);
    scrollToId('configurator');
  });
}
