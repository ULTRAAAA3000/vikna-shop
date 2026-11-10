import { type Config, describeConfig, estimate, formatUah } from '../shared/catalog';
import { type FieldErrors, validateOrder } from '../shared/order';
import { getAttached, onAttached, setAttached } from './store';

type ApiResponse = { ok: true; id: number; estimate?: number | null } | { ok: false; error?: string; errors?: FieldErrors };

export function initOrderForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-order-form]');
  const attachedBox = document.querySelector<HTMLElement>('[data-attached]');
  if (!form || !attachedBox) return;

  const done = form.querySelector<HTMLElement>('[data-done]')!;
  const doneText = form.querySelector<HTMLElement>('[data-done-text]')!;
  const doneTitle = form.querySelector<HTMLElement>('[data-done-title]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const label = submit.querySelector<HTMLElement>('[data-label]')!;
  const productSelect = form.elements.namedItem('product') as HTMLSelectElement;

  const setError = (field: string, message: string | undefined) => {
    const el = form.querySelector<HTMLElement>(`[data-err="${field}"]`);
    if (el) el.textContent = message ?? '';
    const input = form.elements.namedItem(field);
    const wrapper = input instanceof Element ? input.closest('.field') : null;
    wrapper?.classList.toggle('invalid', Boolean(message));
    if (input instanceof HTMLElement) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  };
  const clearErrors = () => ['name', 'phone', 'email', 'consent', 'form'].forEach((f) => setError(f, undefined));

  const showErrors = (errors: FieldErrors) => {
    clearErrors();
    (Object.keys(errors) as (keyof FieldErrors)[]).forEach((k) => setError(k, errors[k]));
    const firstKey = (Object.keys(errors) as string[])[0];
    const first = firstKey ? form.elements.namedItem(firstKey) : null;
    if (first instanceof HTMLElement) first.focus();
  };

  /** Демонстраційний режим: VITE_DEMO_MODE=true завжди показує «Тестове спрацювання» без звернення до API. */
  const demoAlways = import.meta.env.VITE_DEMO_MODE === 'true';

  const finish = (title: string, text: string) => {
    doneTitle.textContent = title;
    doneText.textContent = text;
    done.hidden = false;
    form.reset();
    setAttached(null);
  };

  /** Сайт працює без бекенду (демо, перегляд статики) — замість помилки показуємо тестове повідомлення. */
  const finishAsTest = () =>
    finish(
      'Тестове спрацювання',
      'Це демонстраційна версія сайту, тому заявку не збережено. У робочій версії ваше звернення буде розглянуто, а менеджер зв’яжеться з вами обраним способом протягом 15 хвилин. Дякуємо, що протестували!',
    );

  // Блок із конфігурацією з конструктора
  const renderAttached = (cfg: Config | null) => {
    if (!cfg) {
      attachedBox.hidden = true;
      attachedBox.innerHTML = '';
      return;
    }
    attachedBox.hidden = false;
    attachedBox.innerHTML = `
      <small>Конфігурація з конструктора</small>
      <p>${describeConfig(cfg)}</p>
      <div class="row-a"><strong>≈ ${formatUah(estimate(cfg).total)}</strong>
      <button type="button" data-detach>Прибрати</button></div>`;
    productSelect.value = cfg.product;
  };
  onAttached(renderAttached);
  attachedBox.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-detach]')) setAttached(null);
  });
  renderAttached(getAttached());

  // Миттєві підказки після виходу з поля
  form.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !['phone', 'email'].includes(t.name) || !t.value) return;
    const res = validateOrder(collect());
    const errs = res.ok ? {} : res.errors;
    setError(t.name, errs[t.name as 'phone' | 'email']);
  });
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && 'name' in t) setError((t as HTMLInputElement).name, undefined);
  });

  function collect() {
    const fd = new FormData(form!);
    return {
      name: fd.get('name'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      city: fd.get('city'),
      contact: fd.get('contact'),
      product: fd.get('product'),
      message: fd.get('message'),
      consent: fd.get('consent') === 'on',
      website: fd.get('website'),
      config: getAttached(),
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const payload = collect();
    const check = validateOrder(payload);
    if (!check.ok) {
      showErrors(check.errors);
      return;
    }

    submit.disabled = true;
    label.textContent = 'Надсилаємо…';
    try {
      if (demoAlways) {
        finishAsTest();
        return;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (res.ok && data?.ok) {
        const num = data.id ? `Номер заявки — №${data.id}. ` : '';
        finish('Заявку прийнято', `${num}Ваше звернення буде розглянуто, а менеджер зв’яжеться з вами обраним способом найближчим часом.`);
      } else if (data && !data.ok && data.errors) {
        showErrors(data.errors);
      } else if (data && !data.ok && res.status === 429) {
        setError('form', data.error || 'Забагато заявок. Спробуйте за кілька хвилин.');
      } else {
        // Немає JSON від нашого API (404/405, збій 5xx, статичний хостинг без воркера) — це не помилка користувача
        finishAsTest();
      }
    } catch {
      // Немає з’єднання з API — теж показуємо тестове повідомлення
      finishAsTest();
    } finally {
      submit.disabled = false;
      label.textContent = 'Надіслати заявку';
    }
  });

  form.querySelector('[data-again]')?.addEventListener('click', () => {
    done.hidden = true;
    (form.elements.namedItem('name') as HTMLInputElement).focus();
  });
}
