import { useMemo, useState } from 'react';

const INITIAL_VISIBLE = 18;

/**
 * Menu de tags na Home. Recebe as facetas de /tags
 * ([{category, tag, deck_count}]) e agrupa em dois blocos:
 *   - Soluções & Features  (category solucao + feature)
 *   - Audiências           (category audiencia)
 * Clicar num chip chama onSelect({ tag, category }).
 */
export function TagExplorer({ facets, activeTag, onSelect, loading }) {
  const { products, audiences } = useMemo(() => {
    const products = [];
    const audiences = [];
    for (const f of facets || []) {
      if (f.category === 'audiencia') audiences.push(f);
      else if (f.category === 'solucao' || f.category === 'feature') products.push(f);
    }
    return { products, audiences };
  }, [facets]);

  if (loading) return <TagSkeleton />;
  if (!products.length && !audiences.length) return null;

  return (
    <div className="mb-10 animate-fade-in">
      <SectionLabel>EXPLORAR POR TAG</SectionLabel>

      <TagGroup
        title="Soluções & Features"
        items={products}
        tone="cyan"
        activeTag={activeTag}
        onSelect={onSelect}
        collapsible={false}
      />

      <TagGroup
        title="Audiências"
        items={audiences}
        tone="amber"
        activeTag={activeTag}
        onSelect={onSelect}
        collapsible
        searchable
      />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-4 bg-hypr-cyan"></div>
      <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400">
        {children}
      </div>
    </div>
  );
}

function TagGroup({ title, items, tone, activeTag, onSelect, collapsible, searchable }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.tag.toLowerCase().includes(q));
  }, [items, query]);

  const visible = collapsible && !expanded && !query ? filtered.slice(0, INITIAL_VISIBLE) : filtered;
  const hidden = filtered.length - visible.length;

  if (!items.length) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="text-[11px] font-medium text-ink-700 dark:text-ink-200 tracking-wide">
          {title}
          <span className="ml-2 text-ink-400 dark:text-ink-500 font-normal">{items.length}</span>
        </div>
        {searchable && items.length > INITIAL_VISIBLE && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar audiências"
            className="h-7 w-44 px-2.5 text-[11px] rounded-md bg-white dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 text-ink-900 dark:text-ink-50 placeholder:text-ink-400 focus:outline-none focus:border-hypr-cyan focus:ring-2 focus:ring-hypr-cyan/20"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((f) => (
          <TagChip
            key={`${f.category}|${f.tag}`}
            facet={f}
            tone={tone}
            active={activeTag?.tag === f.tag && activeTag?.category === f.category}
            onClick={() => onSelect({ tag: f.tag, category: f.category })}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="h-7 px-2.5 rounded-md text-[11px] text-ink-500 dark:text-ink-400 border border-dashed border-ink-300 dark:border-ink-600 hover:border-hypr-cyan hover:text-hypr-cyan transition-colors"
          >
            + {hidden} mais
          </button>
        )}
        {collapsible && expanded && !query && filtered.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="h-7 px-2.5 rounded-md text-[11px] text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition-colors"
          >
            mostrar menos
          </button>
        )}
        {query && !filtered.length && (
          <span className="text-[11px] text-ink-400 py-1">Nenhuma audiência com “{query}”.</span>
        )}
      </div>
    </div>
  );
}

function TagChip({ facet, tone, active, onClick }) {
  const base =
    'h-7 pl-2.5 pr-1.5 rounded-md border text-[11px] font-medium transition-colors inline-flex items-center gap-1.5';
  const toneCls =
    tone === 'amber'
      ? active
        ? 'bg-amber-500/15 border-amber-400 text-amber-800 dark:text-amber-200'
        : 'border-amber-300/60 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20'
      : active
        ? 'bg-hypr-cyan/15 border-hypr-cyan text-hypr-cyan-dark dark:text-hypr-cyan'
        : 'border-hypr-cyan/40 text-hypr-cyan-dark dark:text-hypr-cyan hover:bg-hypr-cyan/5';
  return (
    <button type="button" onClick={onClick} className={`${base} ${toneCls}`} title={`${facet.deck_count} decks`}>
      <span className="truncate max-w-[220px]">{facet.tag}</span>
      <span className="text-[9px] px-1 rounded bg-black/5 dark:bg-white/10 opacity-80 tabular-nums">
        {facet.deck_count}
      </span>
    </button>
  );
}

function TagSkeleton() {
  return (
    <div className="mb-10 animate-pulse">
      <div className="h-3 w-32 bg-ink-200 dark:bg-ink-700/50 rounded mb-4" />
      <div className="flex flex-wrap gap-1.5 mb-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-ink-100 dark:bg-ink-800/40" style={{ width: 60 + (i % 5) * 22 }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-ink-100 dark:bg-ink-800/40" style={{ width: 70 + (i % 6) * 18 }} />
        ))}
      </div>
    </div>
  );
}
