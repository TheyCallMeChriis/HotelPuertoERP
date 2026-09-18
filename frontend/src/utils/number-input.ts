// El estado conserva el texto durante la edición. Vacío no significa cero.
export function numberFromInput(value: string | number): number {
  if (typeof value === 'string' && value.trim() === '') return NaN;
  return Number(value);
}

export function validNumberInput(value: string | number, minimum = 0): boolean {
  const number = numberFromInput(value);
  return Number.isFinite(number) && number >= minimum;
}
