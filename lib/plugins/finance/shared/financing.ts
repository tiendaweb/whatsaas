export type FinancingFrequency = 'weekly' | 'biweekly' | 'monthly';

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

const isoFromUtc = (date: Date) => date.toISOString().slice(0, 10);

/** Conserva el día original y lo recorta al último día de meses más cortos. */
export function installmentDueDate(firstDueOn: string, frequency: FinancingFrequency, index: number) {
  const { year, month, day } = parseIsoDate(firstDueOn);
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + index * (frequency === 'weekly' ? 7 : 14));
    return isoFromUtc(date);
  }

  const targetMonth = month - 1 + index;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return isoFromUtc(new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))));
}

/** Reparte el residuo de centavos entre las primeras cuotas; nunca pierde dinero por redondeo. */
export function buildInstallmentSchedule(input: { totalAmount: number; installmentCount: number; firstDueOn: string; frequency: FinancingFrequency }) {
  const base = Math.floor(input.totalAmount / input.installmentCount);
  const remainder = input.totalAmount % input.installmentCount;
  return Array.from({ length: input.installmentCount }, (_, index) => ({
    installmentNumber: index + 1,
    dueOn: installmentDueDate(input.firstDueOn, input.frequency, index),
    amount: base + (index < remainder ? 1 : 0),
  }));
}
