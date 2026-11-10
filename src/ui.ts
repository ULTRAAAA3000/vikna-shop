const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initHeader(): void {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const burger = document.querySelector<HTMLButtonElement>('.burger');
  const nav = document.getElementById('nav');
  if (!header || !burger || !nav) return;

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setOpen = (open: boolean) => {
    burger.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    header.classList.toggle('menu-open', open);
  };
  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

/** З’являння блоків при прокручуванні; сусідні елементи отримують невелику затримку. */
export function initReveal(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
  if (reduceMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        entry.target.classList.add('in');
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => {
    const parent = el.parentElement;
    if (parent) {
      const idx = Array.from(parent.children).filter((c) => c.classList.contains('reveal')).indexOf(el);
      el.style.setProperty('--d', `${Math.min(idx, 5) * 70}ms`);
    }
    io.observe(el);
  });
}

/** Стулки у hero розчиняються разом із прокручуванням сторінки. */
export function initHero(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const hw = hero?.querySelector<HTMLElement>('.hw');
  if (!hero || !hw) return;

  let intro = 0;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const h = hero.offsetHeight || 1;
    const p = Math.min(1, Math.max(0, window.scrollY / (h * 0.62)));
    hw.style.setProperty('--open', Math.max(intro, p).toFixed(3));
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  if (reduceMotion()) {
    intro = 0.25;
    apply();
    return;
  }
  const start = performance.now() + 450;
  const tick = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / 1500));
    intro = 0.3 * (1 - Math.pow(1 - t, 3));
    apply();
    if (t < 1) requestAnimationFrame(tick);
  };
  apply();
  requestAnimationFrame(tick);
}

export function initCounters(): void {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  const fmt = new Intl.NumberFormat('uk-UA');
  const setValue = (el: HTMLElement, v: number) => {
    el.textContent = `${fmt.format(Math.round(v))}${el.dataset.suffix ?? ''}`;
  };
  if (reduceMotion() || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target as HTMLElement;
      io.unobserve(el);
      const target = Number(el.dataset.count);
      const dur = 1400;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        setValue(el, target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  nodes.forEach((el) => {
    setValue(el, 0);
    io.observe(el);
  });
}

/** Плавна прокрутка до блоку з урахуванням prefers-reduced-motion. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}
