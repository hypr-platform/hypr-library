import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Aba Analytics — tags mais usadas, no geral e por cliente.
 * Dados: GET /tags/analytics → { by_client_tag: [{client, category, tag, decks}], clients: [...] }
 * Gráficos em CSS/SVG puro (sem lib), no estilo da Library.
 */
export function AnalyticsView({ onTagSelect, onClientSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedClient, setSelectedClient] = useState('');
  const [clientQuery, setClientQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .tagAnalytics()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const first = (d?.clients || []).find((c) => c.decks_tagged > 0);
        if (first) setSelectedClient(first.client);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const agg = useMemo(() => aggregate(data), [data]);

  const clientOptions = useMemo(() => {
    const list = (data?.clients || []).filter((c) => c.decks_tagged > 0);
    if (!clientQuery.trim()) return list;
    const q = clientQuery.toLowerCase();
    return list.filter((c) => c.client.toLowerCase().includes(q));
  }, [data, clientQuery]);

  const clientAgg = useMemo(() => {
    if (!data || !selectedClient) return null;
    const rows = data.by_client_tag.filter((r) => r.client === selectedClient);
    const meta = data.clients.find((c) => c.client === selectedClient);
    return {
      meta,
      products: rows.filter((r) => r.category !== 'audiencia').sort((a, b) => b.decks - a.decks),
      audiences: rows.filter((r) => r.category === 'audiencia').sort((a, b) => b.decks - a.decks),
    };
  }, [data, selectedClient]);

  if (loading) return <AnalyticsSkeleton />;
  if (error) {
    return (
      <div className="px-4 py-3 rounded-md bg-hypr-pink-soft/30 border border-hypr-pink/30 text-[13px] text-hypr-pink">
        {error}
      </div>
    );
  }
  if (!agg || !agg.totalTagged) {
    return (
      <div className="py-20 text-center text-[13px] text-ink-400 font-light">
        Ainda não há tags indexadas. O tagging roda no sync — volta em alguns minutos.
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Kpi label="DECKS COM TAG" value={agg.totalTagged} />
        <Kpi label="CLIENTES COM TAG" value={agg.clientsTagged} />
        <Kpi label="SOLUÇÕES & FEATURES" value={agg.products.length} />
        <Kpi label="AUDIÊNCIAS DISTINTAS" value={agg.audiences.length} />
      </div>

      {/* Geral: duas colunas */}
      <SectionLabel>MAIS USADAS EM TODA A BIBLIOTECA</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        <Card title="Soluções & Features" subtitle="nº de decks em que a tag aparece">
          <BarList items={agg.products.slice(0, 15)} tone="cyan" onClick={(i) => onTagSelect?.({ tag: i.tag, category: i.category })} />
        </Card>
        <Card title="Audiências" subtitle="top 15 · clique pra ver os decks">
          <BarList items={agg.audiences.slice(0, 15)} tone="amber" onClick={(i) => onTagSelect?.({ tag: i.tag, category: i.category })} />
        </Card>
      </div>

      {/* Por cliente */}
      <SectionLabel>POR CLIENTE</SectionLabel>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="text"
          value={clientQuery}
          onChange={(e) => setClientQuery(e.target.value)}
          placeholder="Filtrar cliente"
          className="h-9 w-full sm:w-56 px-3 text-[13px] rounded-md bg-white dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 text-ink-900 dark:text-ink-50 placeholder:text-ink-400 focus:outline-none focus:border-hypr-cyan focus:ring-2 focus:ring-hypr-cyan/20"
        />
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="h-9 w-full sm:w-72 px-3 text-[13px] rounded-md bg-white dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 text-ink-900 dark:text-ink-50 focus:outline-none focus:border-hypr-cyan focus:ring-2 focus:ring-hypr-cyan/20"
        >
          {clientOptions.map((c) => (
            <option key={c.client} value={c.client}>
              {c.client} · {c.decks_tagged} deck{c.decks_tagged === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        {selectedClient && (
          <button
            type="button"
            onClick={() => onClientSelect?.(selectedClient)}
            className="h-9 px-3 rounded-md border border-ink-200 dark:border-ink-700 text-[12px] text-ink-600 dark:text-ink-300 hover:border-hypr-cyan hover:text-hypr-cyan transition-colors"
          >
            Abrir decks de {selectedClient} →
          </button>
        )}
      </div>

      {clientAgg && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          <Card
            title="Soluções & Features"
            subtitle={`${clientAgg.meta?.decks_tagged ?? 0} de ${clientAgg.meta?.decks_total ?? 0} decks com tag`}
          >
            {clientAgg.products.length ? (
              <BarList items={clientAgg.products.slice(0, 12)} tone="cyan" onClick={(i) => onTagSelect?.({ tag: i.tag, category: i.category })} />
            ) : (
              <Empty />
            )}
          </Card>
          <Card title="Audiências" subtitle="clusters usados nos decks deste cliente">
            {clientAgg.audiences.length ? (
              <BarList items={clientAgg.audiences.slice(0, 12)} tone="amber" onClick={(i) => onTagSelect?.({ tag: i.tag, category: i.category })} />
            ) : (
              <Empty />
            )}
          </Card>
        </div>
      )}

      {/* Matriz cliente × solução */}
      <SectionLabel>CLIENTES × SOLUÇÕES</SectionLabel>
      <Card title="Top 15 clientes por decks taggeados" subtitle="nº de decks do cliente em que a solução/feature aparece">
        <Matrix agg={agg} data={data} onClientSelect={onClientSelect} onTagSelect={onTagSelect} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------
// Agregações
// ------------------------------------------------------------------
function aggregate(data) {
  if (!data) return null;
  const byTag = new Map();
  for (const r of data.by_client_tag) {
    const key = `${r.category}|${r.tag}`;
    const cur = byTag.get(key) || { tag: r.tag, category: r.category, decks: 0, clients: 0 };
    cur.decks += r.decks;
    cur.clients += 1;
    byTag.set(key, cur);
  }
  const all = [...byTag.values()].sort((a, b) => b.decks - a.decks);
  const products = all.filter((t) => t.category !== 'audiencia');
  const audiences = all.filter((t) => t.category === 'audiencia');
  const clientsTagged = data.clients.filter((c) => c.decks_tagged > 0);
  const totalTagged = clientsTagged.reduce((s, c) => s + c.decks_tagged, 0);
  return { products, audiences, clientsTagged: clientsTagged.length, totalTagged, clients: clientsTagged };
}

// ------------------------------------------------------------------
// UI
// ------------------------------------------------------------------
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-4 bg-hypr-cyan"></div>
      <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400">{children}</div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-xl bg-ink-50/60 dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700/40 p-4">
      <div className="text-[20px] font-light text-ink-900 dark:text-ink-50 tracking-tight leading-none mb-1.5">{value}</div>
      <div className="text-[9px] tracking-[0.18em] font-medium text-ink-500 dark:text-ink-400">{label}</div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-xl bg-white dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700/40 p-5">
      <div className="mb-4">
        <div className="text-[13px] font-medium text-ink-900 dark:text-ink-50">{title}</div>
        {subtitle && <div className="text-[11px] text-ink-400 dark:text-ink-500 font-light">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-[12px] text-ink-400 font-light">Sem dados.</div>;
}

function BarList({ items, tone, onClick }) {
  const max = Math.max(1, ...items.map((i) => i.decks));
  const bar = tone === 'amber' ? 'bg-amber-400/80 dark:bg-amber-400/70' : 'bg-hypr-cyan/80';
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((i) => (
        <button
          key={`${i.category}|${i.tag}`}
          type="button"
          onClick={() => onClick?.(i)}
          className="group grid grid-cols-[minmax(0,42%)_1fr_auto] items-center gap-3 text-left"
          title={i.clients ? `${i.decks} decks · ${i.clients} clientes` : `${i.decks} decks`}
        >
          <span className="text-[12px] text-ink-700 dark:text-ink-200 truncate group-hover:text-hypr-cyan transition-colors">{i.tag}</span>
          <span className="h-2.5 rounded-sm bg-ink-100 dark:bg-ink-700/40 overflow-hidden">
            <span className={`block h-full rounded-sm ${bar} transition-all`} style={{ width: `${(i.decks / max) * 100}%` }} />
          </span>
          <span className="text-[11px] tabular-nums text-ink-500 dark:text-ink-400 w-8 text-right">{i.decks}</span>
        </button>
      ))}
    </div>
  );
}

function Matrix({ agg, data, onClientSelect, onTagSelect }) {
  const grid = useMemo(() => {
    if (!data) return null;
    const topClients = agg.clients.slice(0, 15).map((c) => c.client);
    const topTags = agg.products.slice(0, 8).map((t) => t.tag);
    const cell = new Map();
    let max = 1;
    for (const r of data.by_client_tag) {
      if (r.category === 'audiencia') continue;
      if (!topClients.includes(r.client) || !topTags.includes(r.tag)) continue;
      const k = `${r.client}|${r.tag}`;
      const v = (cell.get(k) || 0) + r.decks;
      cell.set(k, v);
      if (v > max) max = v;
    }
    return { topClients, topTags, cell, max };
  }, [data, agg]);

  if (!grid) return <div className="h-40 animate-pulse rounded-md bg-ink-100 dark:bg-ink-800/40" />;

  return (
    <div className="overflow-x-auto scroll-thin -mx-2 px-2">
      <table className="w-full text-[11px] border-separate border-spacing-y-1">
        <thead>
          <tr>
            <th className="text-left font-medium text-ink-500 dark:text-ink-400 pr-3 py-1 whitespace-nowrap">Cliente</th>
            {grid.topTags.map((t) => (
              <th key={t} className="font-medium text-ink-500 dark:text-ink-400 px-1 py-1 text-center align-bottom">
                <button
                  type="button"
                  onClick={() => onTagSelect?.({ tag: t, category: 'solucao' })}
                  className="block max-w-[92px] mx-auto leading-tight hover:text-hypr-cyan transition-colors"
                >
                  {t}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.topClients.map((c) => (
            <tr key={c}>
              <td className="pr-3 py-0.5 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onClientSelect?.(c)}
                  className="text-ink-700 dark:text-ink-200 hover:text-hypr-cyan transition-colors truncate max-w-[160px] block text-left"
                >
                  {c}
                </button>
              </td>
              {grid.topTags.map((t) => {
                const v = grid.cell.get(`${c}|${t}`) || 0;
                const alpha = v ? 0.15 + 0.7 * (v / grid.max) : 0;
                return (
                  <td key={t} className="px-1 py-0.5">
                    <div
                      className="h-7 rounded-md flex items-center justify-center tabular-nums text-ink-800 dark:text-ink-50"
                      style={{ background: v ? `rgba(45,160,222,${alpha.toFixed(2)})` : 'transparent', border: v ? 'none' : '1px dashed rgba(120,130,140,0.25)' }}
                      title={`${c} · ${t}: ${v} decks`}
                    >
                      {v || ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-ink-100 dark:bg-ink-800/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        <div className="h-80 rounded-xl bg-ink-100 dark:bg-ink-800/40" />
        <div className="h-80 rounded-xl bg-ink-100 dark:bg-ink-800/40" />
      </div>
    </div>
  );
}
