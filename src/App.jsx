import { useEffect, useMemo, useState } from 'react';
import {
  Button, IconButton, FAB, SegmentedButton, Chip, ChipSet, Card, TextField, SearchBar, Switch, List, ListItem, Avatar,
  NavigationRail, TopAppBar, Dialog, Snackbar, LinearProgress, EmptyState, Icon,
} from './m3/index.jsx';
import { usePersistentState } from './lib/storage.js';
import { saveTextFile, openTextFile } from './lib/files.js';
import { getThemeMode, setThemeMode } from './lib/theme.js';
import { CATEGORIES, CYCLES, categoryOf, monthlyCost, nextRenewal, daysUntil, formatMoney, formatDate, toCsv, todayIso, newId } from './subscriptions.js';

const VIEWS = [
  { value: 'dashboard', label: 'Accueil', icon: 'space_dashboard' },
  { value: 'subscriptions', label: 'Abonnements', icon: 'receipt_long' },
  { value: 'settings', label: 'Réglages', icon: 'settings' },
];

function useHashView() {
  const read = () => (VIEWS.some((v) => v.value === location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
  const [view, setView] = useState(read);
  useEffect(() => {
    const onHash = () => setView(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [view, (v) => { location.hash = v; setView(v); }];
}

export default function App() {
  const [view, setView] = useHashView();
  const [subs, setSubs] = usePersistentState('abo.subscriptions', []);
  const [settings, setSettings] = usePersistentState('abo.settings', { currency: 'EUR', horizon: 30 });
  const [editing, setEditing] = useState(null);
  const [snack, setSnack] = useState(null);

  const money = (v) => formatMoney(v, settings.currency);

  function saveSub(sub) {
    setSubs((list) => (list.some((s) => s.id === sub.id) ? list.map((s) => (s.id === sub.id ? sub : s)) : [...list, sub]));
    setEditing(null);
    setSnack({ message: `« ${sub.name} » enregistré` });
  }
  function removeSub(sub) {
    const before = subs;
    setSubs((list) => list.filter((s) => s.id !== sub.id));
    setEditing(null);
    setSnack({ message: `« ${sub.name} » supprimé`, actionLabel: 'Annuler', onAction: () => { setSubs(before); setSnack(null); } });
  }

  const title = VIEWS.find((v) => v.value === view).label;
  return (
    <div className="m3-app">
      <NavigationRail
        items={VIEWS}
        value={view}
        onChange={setView}
        fab={<FAB icon="add" color="tertiary" label="Ajouter un abonnement" onClick={() => setEditing({})} />}
        footer={<Icon name="radar" style={{ color: 'var(--md-sys-color-primary)' }} label="Abo Radar" />}
      />
      <main className="m3-main">
        <TopAppBar
          title={view === 'dashboard' ? 'Abo Radar' : title}
          actions={view !== 'settings' && <Button icon="add" onClick={() => setEditing({})}>Nouvel abonnement</Button>}
        />
        <div className="m3-content">
          {view === 'dashboard' && <Dashboard subs={subs} money={money} horizon={settings.horizon} onOpen={setEditing} onAdd={() => setEditing({})} />}
          {view === 'subscriptions' && <Subscriptions subs={subs} money={money} onOpen={setEditing} onToggle={(s) => saveSub({ ...s, active: !s.active })} onAdd={() => setEditing({})} />}
          {view === 'settings' && <Settings settings={settings} setSettings={setSettings} subs={subs} setSubs={setSubs} notify={(m) => setSnack({ message: m })} />}
        </div>
      </main>
      {editing && <EditDialog sub={editing} onSave={saveSub} onDelete={removeSub} onClose={() => setEditing(null)} currency={settings.currency} />}
      <Snackbar open={!!snack} message={snack?.message} actionLabel={snack?.actionLabel} onAction={snack?.onAction} onClose={() => setSnack(null)} />
    </div>
  );
}

function Stat({ icon, label, value, hint, tone = 'primary' }) {
  return (
    <Card variant="filled" style={{ background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)` }}>
      <div className="m3-row" style={{ justifyContent: 'space-between' }}>
        <span className="label-large">{label}</span>
        <Icon name={icon} />
      </div>
      <div className="display-small" style={{ margin: '12px 0 4px' }}>{value}</div>
      <div className="body-medium" style={{ opacity: 0.85 }}>{hint}</div>
    </Card>
  );
}

function Dashboard({ subs, money, horizon, onOpen, onAdd }) {
  const active = subs.filter((s) => s.active);
  const monthly = active.reduce((sum, s) => sum + monthlyCost(s), 0);
  const upcoming = active
    .map((s) => ({ s, date: nextRenewal(s) }))
    .filter((x) => daysUntil(x.date) <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
  const dueSoon = upcoming.reduce((sum, x) => sum + Number(x.s.amount), 0);
  const byCat = CATEGORIES.map((c) => ({ ...c, total: active.filter((s) => s.category === c.value).reduce((sum, s) => sum + monthlyCost(s), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const top = [...active].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];

  if (!subs.length) {
    return (
      <EmptyState icon="radar" title="Aucun abonnement suivi" action={<Button icon="add" onClick={onAdd}>Ajouter mon premier abonnement</Button>}>
        Ajoutez vos abonnements pour voir ce qu'ils vous coûtent vraiment chaque mois et chaque année.
      </EmptyState>
    );
  }

  return (
    <div className="m3-stack">
      <div className="m3-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Stat icon="calendar_month" label="Par mois" value={money(monthly)} hint={`${active.length} abonnement${active.length > 1 ? 's' : ''} actif${active.length > 1 ? 's' : ''}`} />
        <Stat icon="savings" label="Par an" value={money(monthly * 12)} hint="Si rien ne change" tone="secondary" />
        <Stat icon="event_upcoming" label={`${horizon} prochains jours`} value={money(dueSoon)} hint={`${upcoming.length} prélèvement${upcoming.length > 1 ? 's' : ''} à venir`} tone="tertiary" />
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <Card variant="outlined" style={{ padding: 0 }}>
          <div className="title-medium" style={{ padding: '16px 16px 0' }}>Prochains prélèvements</div>
          {upcoming.length ? (
            <List>
              {upcoming.slice(0, 7).map(({ s, date }) => {
                const d = daysUntil(date);
                return (
                  <ListItem key={s.id} onClick={() => onOpen(s)} leading={<CategoryAvatar category={s.category} />}
                    headline={s.name} supporting={`${formatDate(date)} · ${d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : `dans ${d} jours`}`}
                    trailing={<span className="title-small" style={{ color: 'var(--md-sys-color-on-surface)' }}>{money(s.amount)}</span>} />
                );
              })}
            </List>
          ) : <div className="m3-muted body-medium" style={{ padding: 16 }}>Rien à payer sur cette période.</div>}
        </Card>
        <div className="m3-stack">
          <Card variant="outlined">
            <div className="title-medium" style={{ marginBottom: 16 }}>Par catégorie (mensuel)</div>
            <div className="m3-stack" style={{ gap: 12 }}>
              {byCat.map((c) => (
                <div key={c.value}>
                  <div className="m3-row body-medium" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="m3-row"><Icon name={c.icon} size={18} style={{ color: 'var(--md-sys-color-primary)' }} />{c.label}</span>
                    <span>{money(c.total)}</span>
                  </div>
                  <LinearProgress value={c.total / byCat[0].total} />
                </div>
              ))}
            </div>
          </Card>
          {top && (
            <Card variant="filled">
              <div className="m3-row label-large" style={{ color: 'var(--md-sys-color-primary)' }}><Icon name="lightbulb" size={18} />Le plus gros poste</div>
              <div className="body-medium" style={{ marginTop: 8 }}>
                <strong>{top.name}</strong> représente {money(monthlyCost(top))} par mois, soit {Math.round((monthlyCost(top) / monthly) * 100)} % du total.
                L'utilisez-vous assez pour le garder ?
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryAvatar({ category }) {
  const c = categoryOf(category);
  return <Avatar style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}><Icon name={c.icon} size={20} /></Avatar>;
}

function Subscriptions({ subs, money, onOpen, onToggle, onAdd }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(null);
  const [sort, setSort] = useState('date');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subs
      .filter((s) => (!q || s.name.toLowerCase().includes(q)) && (!cat || s.category === cat))
      .map((s) => ({ s, date: nextRenewal(s) }))
      .sort((a, b) => (sort === 'date' ? a.date.localeCompare(b.date) : sort === 'cost' ? monthlyCost(b.s) - monthlyCost(a.s) : a.s.name.localeCompare(b.s.name)));
  }, [subs, query, cat, sort]);
  const used = CATEGORIES.filter((c) => subs.some((s) => s.category === c.value));

  if (!subs.length) return <EmptyState icon="receipt_long" title="Liste vide" action={<Button icon="add" onClick={onAdd}>Ajouter un abonnement</Button>}>Vos abonnements apparaîtront ici.</EmptyState>;
  return (
    <div className="m3-stack">
      <div className="m3-row" style={{ justifyContent: 'space-between' }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Rechercher un abonnement" />
        <SegmentedButton value={sort} onChange={setSort} options={[{ value: 'date', label: 'Échéance' }, { value: 'cost', label: 'Coût' }, { value: 'name', label: 'Nom' }]} />
      </div>
      <ChipSet>
        <Chip selected={!cat} onClick={() => setCat(null)}>Toutes</Chip>
        {used.map((c) => <Chip key={c.value} icon={c.icon} selected={cat === c.value} onClick={() => setCat(cat === c.value ? null : c.value)}>{c.label}</Chip>)}
      </ChipSet>
      <Card variant="outlined" style={{ padding: 0 }}>
        <List>
          {shown.map(({ s, date }) => (
            <ListItem key={s.id} onClick={() => onOpen(s)} leading={<CategoryAvatar category={s.category} />}
              headline={<span style={{ opacity: s.active ? 1 : 0.5 }}>{s.name}</span>}
              supporting={s.active ? `${money(s.amount)} ${CYCLES.find((c) => c.value === s.cycle).short} · prochain le ${formatDate(date)}` : 'En pause'}
              trailing={<span onClick={(e) => e.stopPropagation()} className="m3-row"><span className="title-small" style={{ color: 'var(--md-sys-color-on-surface)', minWidth: 90, textAlign: 'right' }}>{money(monthlyCost(s))}/mois</span><Switch checked={s.active} onChange={() => onToggle(s)} /></span>} />
          ))}
        </List>
        {!shown.length && <div className="m3-muted body-medium" style={{ padding: 16 }}>Aucun résultat.</div>}
      </Card>
    </div>
  );
}

function EditDialog({ sub, onSave, onDelete, onClose, currency }) {
  const isNew = !sub.id;
  const [form, setForm] = useState({ name: '', amount: '', cycle: 'monthly', category: 'streaming', nextDate: todayIso(), active: true, notes: '', ...sub });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const amount = Number(String(form.amount).replace(',', '.'));
  const errors = { name: !form.name.trim() && 'Donnez un nom', amount: !(amount > 0) && 'Entrez un montant supérieur à 0' };
  const valid = !errors.name && !errors.amount && form.nextDate;
  return (
    <Dialog open headline={isNew ? 'Nouvel abonnement' : 'Modifier l’abonnement'} onClose={onClose}
      actions={<>
        {!isNew && <Button variant="text" icon="delete" onClick={() => onDelete(sub)} style={{ marginRight: 'auto', color: 'var(--md-sys-color-error)' }}>Supprimer</Button>}
        <Button variant="text" onClick={onClose}>Annuler</Button>
        <Button disabled={!valid} onClick={() => onSave({ ...form, name: form.name.trim(), amount, id: form.id ?? newId() })}>Enregistrer</Button>
      </>}>
      <TextField label="Nom" value={form.name} onChange={set('name')} error={form.name !== '' || !isNew ? errors.name : undefined} autoFocus />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TextField label={`Montant (${currency})`} value={String(form.amount)} onChange={set('amount')} inputMode="decimal" error={form.amount !== '' ? errors.amount : undefined} />
        <TextField label="Fréquence" value={form.cycle} onChange={set('cycle')} options={CYCLES.map((c) => ({ value: c.value, label: c.label }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TextField label="Catégorie" value={form.category} onChange={set('category')} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
        <TextField label="Prochain prélèvement" type="date" value={form.nextDate} onChange={set('nextDate')} />
      </div>
      <TextField label="Notes" value={form.notes} onChange={set('notes')} multiline supportingText="Date de fin d'engagement, compte utilisé…" />
      <Switch checked={form.active} onChange={set('active')} label="Abonnement actif" />
    </Dialog>
  );
}

function Settings({ settings, setSettings, subs, setSubs, notify }) {
  const [theme, setTheme] = useState(getThemeMode());
  async function exportJson() {
    const r = await saveTextFile('abo-radar.json', JSON.stringify({ app: 'abo-radar', version: 1, subscriptions: subs }, null, 2), [{ name: 'JSON', extensions: ['json'] }]);
    if (r?.saved) notify('Sauvegarde exportée');
  }
  async function exportCsv() {
    const r = await saveTextFile('abonnements.csv', toCsv(subs), [{ name: 'CSV', extensions: ['csv'] }]);
    if (r?.saved) notify('Tableau CSV exporté');
  }
  async function importJson() {
    const file = await openTextFile([{ name: 'JSON', extensions: ['json'] }]);
    if (!file) return;
    try {
      const data = JSON.parse(file.content);
      if (!Array.isArray(data.subscriptions)) throw new Error();
      const clean = data.subscriptions.filter((s) => s && typeof s.name === 'string' && Number(s.amount) > 0).map((s) => ({ ...s, id: s.id ?? newId() }));
      setSubs(clean);
      notify(`${clean.length} abonnement(s) importé(s)`);
    } catch {
      notify("Ce fichier n'est pas une sauvegarde Abo Radar");
    }
  }
  return (
    <div className="m3-stack" style={{ maxWidth: 720 }}>
      <Card variant="outlined">
        <div className="title-medium" style={{ marginBottom: 16 }}>Apparence</div>
        <SegmentedButton value={theme} onChange={(v) => { setTheme(v); setThemeMode(v); }}
          options={[{ value: 'system', label: 'Système', icon: 'contrast' }, { value: 'light', label: 'Clair', icon: 'light_mode' }, { value: 'dark', label: 'Sombre', icon: 'dark_mode' }]} />
      </Card>
      <Card variant="outlined">
        <div className="title-medium" style={{ marginBottom: 16 }}>Affichage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <TextField label="Devise" value={settings.currency} onChange={(v) => setSettings((s) => ({ ...s, currency: v }))}
            options={[{ value: 'EUR', label: 'Euro (€)' }, { value: 'USD', label: 'Dollar ($)' }, { value: 'GBP', label: 'Livre (£)' }, { value: 'CHF', label: 'Franc suisse (CHF)' }, { value: 'CAD', label: 'Dollar canadien (CA$)' }]} />
          <TextField label="Échéances à afficher" value={String(settings.horizon)} onChange={(v) => setSettings((s) => ({ ...s, horizon: Number(v) }))}
            options={[{ value: '7', label: '7 jours' }, { value: '30', label: '30 jours' }, { value: '60', label: '60 jours' }, { value: '90', label: '90 jours' }]} />
        </div>
      </Card>
      <Card variant="outlined">
        <div className="title-medium">Données</div>
        <p className="body-medium m3-muted">Tout reste sur votre ordinateur : aucun compte, aucun envoi sur internet.</p>
        <div className="m3-row">
          <Button variant="tonal" icon="download" onClick={exportJson}>Exporter la sauvegarde</Button>
          <Button variant="outlined" icon="upload" onClick={importJson}>Importer</Button>
          <Button variant="text" icon="table" onClick={exportCsv}>Exporter en CSV</Button>
        </div>
      </Card>
    </div>
  );
}
