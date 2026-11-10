import { buildPriceList } from '../shared/catalog';

export function initPrices(): void {
  const root = document.querySelector<HTMLElement>('[data-prices]');
  if (!root) return;
  const groups = buildPriceList();
  let active = groups[0]?.id ?? '';

  const render = () => {
    const group = groups.find((g) => g.id === active) ?? groups[0];
    if (!group) return;
    root.innerHTML = `
      <div class="ptabs reveal in" role="group" aria-label="Категорії прайс-листа">
        ${groups.map((g) => `<button class="chip" type="button" data-tab="${g.id}" aria-pressed="${g.id === active}">${g.title}</button>`).join('')}
      </div>
      <table class="ptable">
        <caption class="sr-only" hidden>${group.title}</caption>
        <thead><tr><th scope="col">Позиція</th><th scope="col">Одиниця</th><th scope="col">Ціна</th></tr></thead>
        <tbody>
          ${group.rows
            .map(
              (r) => `<tr>
            <td class="nm">${r.name}${r.note ? `<small>${r.note}</small>` : ''}</td>
            <td class="un">${r.unit}</td>
            <td class="pr">${r.price}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <div class="price-foot">
        <span>Ціни демонстраційні та вказані в гривнях з ПДВ. Для точного розрахунку скористайтеся конструктором.</span>
        <a class="btn btn-ghost btn-sm" href="#configurator">Відкрити конструктор</a>
      </div>`;
  };

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (!btn || btn.dataset.tab === active) return;
    active = btn.dataset.tab ?? active;
    render();
    root.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`)?.focus();
  });
  render();
}
