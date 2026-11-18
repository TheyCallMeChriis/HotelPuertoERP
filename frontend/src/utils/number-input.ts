// State keeps the raw text while editing. Empty does not mean zero.
export function numberFromInput(value: string | number): number {
  if (typeof value === 'string' && value.trim() === '') return NaN;
  return Number(value);
}

// True when the input holds a finite number not below the minimum
export function validNumberInput(value: string | number, minimum = 0): boolean {
  const number = numberFromInput(value);
  return Number.isFinite(number) && number >= minimum;
}
