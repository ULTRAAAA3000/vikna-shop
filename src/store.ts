import { type Config, type ProductKind } from '../shared/catalog';

/**
 * Невеличка шина подій між незалежними блоками сторінки:
 * картки продукції → конструктор → форма заявки.
 */
type Listener<T> = (value: T) => void;

let attached: Config | null = null;
const attachedListeners = new Set<Listener<Config | null>>();
const configureListeners = new Set<Listener<ProductKind>>();

export function getAttached(): Config | null {
  return attached;
}

export function setAttached(cfg: Config | null): void {
  attached = cfg ? { ...cfg } : null;
  attachedListeners.forEach((fn) => fn(attached));
}

export function onAttached(fn: Listener<Config | null>): void {
  attachedListeners.add(fn);
}

/** Попросити конструктор відкрити вказаний тип виробу. */
export function requestConfigure(product: ProductKind): void {
  configureListeners.forEach((fn) => fn(product));
}

export function onConfigure(fn: Listener<ProductKind>): void {
  configureListeners.add(fn);
}
