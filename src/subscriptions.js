// Subscription maths: monthly equivalent, next renewal date, formatting and CSV export.

export const CATEGORIES = [
  { value: 'streaming', label: 'Vidéo', icon: 'movie' },
  { value: 'music', label: 'Musique', icon: 'music_note' },
  { value: 'software', label: 'Logiciels', icon: 'apps' },
  { value: 'cloud', label: 'Stockage', icon: 'cloud' },
  { value: 'telecom', label: 'Téléphonie', icon: 'smartphone' },
  { value: 'home', label: 'Maison', icon: 'home' },
  { value: 'sport', label: 'Sport', icon: 'fitness_center' },
  { value: 'news', label: 'Presse', icon: 'newspaper' },
  { value: 'games', label: 'Jeux', icon: 'sports_esports' },
  { value: 'other', label: 'Autre', icon: 'category' },
];

export const CYCLES = [
  { value: 'weekly', label: 'Chaque semaine', short: '/ sem.', perMonth: 52 / 12 },
  { value: 'monthly', label: 'Chaque mois', short: '/ mois', perMonth: 1 },
  { value: 'quarterly', label: 'Chaque trimestre', short: '/ trim.', perMonth: 1 / 3 },
  { value: 'yearly', label: 'Chaque année', short: '/ an', perMonth: 1 / 12 },
];

export const categoryOf = (value) => CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];

export function monthlyCost(sub) {
  const cycle = CYCLES.find((c) => c.value === sub.cycle) ?? CYCLES[1];
  return Number(sub.amount) * cycle.perMonth;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayIso = () => iso(new Date());

function addCycle(date, cycle, anchorDay) {
  const d = new Date(date);
  if (cycle === 'weekly') {
    d.setDate(d.getDate() + 7);
    return d;
  }
  const months = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, last)); // 31st -> last day of shorter months
  return target;
}

/** First renewal date on or after today (the stored date may be in the past). */
export function nextRenewal(sub) {
  if (!sub.nextDate) return todayIso();
  const today = parse(todayIso());
  let d = parse(sub.nextDate);
  const anchor = d.getDate();
  for (let i = 0; d < today && i < 1000; i++) d = addCycle(d, sub.cycle, anchor);
  return iso(d);
}

export const daysUntil = (isoDate) => Math.round((parse(isoDate) - parse(todayIso())) / 86_400_000);

export const formatMoney = (value, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);

export const formatDate = (isoDate) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(parse(isoDate));

export function toCsv(subs) {
  const head = ['Nom', 'Montant', 'Fréquence', 'Coût mensuel', 'Catégorie', 'Prochain prélèvement', 'Actif', 'Notes'];
  const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = subs.map((s) => [
    s.name,
    Number(s.amount).toFixed(2),
    CYCLES.find((c) => c.value === s.cycle)?.label,
    monthlyCost(s).toFixed(2),
    categoryOf(s.category).label,
    nextRenewal(s),
    s.active ? 'oui' : 'non',
    s.notes,
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
