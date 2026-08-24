/** 尾触发的防抖：延迟内重复调用只保留最后一次参数。 */

export interface Debounced<F extends (...args: never[]) => void> {
  (...args: Parameters<F>): void;
  cancel(): void;
}

export function debounce<F extends (...args: never[]) => void>(
  fn: F,
  waitMs: number,
): Debounced<F> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<F>): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
