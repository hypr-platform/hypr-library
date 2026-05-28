import { useState } from 'react';
import { Icon } from '../lib/icons.jsx';
import { gradientFor, cleanTitle, formatBytes, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';

export function DeckCard({ deck, onClick, showClientBadge }) {
  const gradient = gradientFor(deck.title);
  const displayTitle = cleanTitle(deck.title);

  // Estados da thumbnail: 'loading' | 'loaded' | 'error'
  const [thumbState, setThumbState] = useState('loading');

  // Sempre usa o proxy do backend (URL fresca, não expira)
  const thumbSrc = api.thumbnailUrl(deck.deck_id, 600);

  return (
    <button
      onClick={onClick}
      className="group text-left bg-white dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700/60 rounded-xl overflow-hidden hover:border-hypr-cyan dark:hover:border-hypr-cyan transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(45,160,222,0.08)] animate-scale-in"
    >
      <div className="aspect-[16/10] relative overflow-hidden bg-ink-100 dark:bg-ink-800">
        {/* Skeleton shimmer enquanto carrega */}
        {thumbState === 'loading' && (
          <div className="absolute inset-0 thumb-shimmer" />
        )}

        {/* Fallback com gradiente HYPR quando dá erro */}
        {thumbState === 'error' && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: gradient }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent group-hover:from-black/10 transition-all" />
            <div className="text-white/30 group-hover:text-white/50 transition-colors relative z-10">
              <Icon.Presentation />
            </div>
          </div>
        )}

        {/* Imagem real — fade-in quando carrega */}
        <img
          src={thumbSrc}
          alt={displayTitle}
          loading="lazy"
          decoding="async"
          onLoad={() => setThumbState('loaded')}
          onError={() => setThumbState('error')}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            thumbState === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Overlay HYPR + badges (sempre visíveis) */}
        <div className="absolute top-2 right-2.5 hypr-logo text-[9px] text-white/50 group-hover:text-white/70 transition-colors z-10 mix-blend-difference">
          HYPR°
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
          <span className="bg-black/50 backdrop-blur-sm text-white/90 text-[10px] px-2 py-0.5 rounded font-normal tracking-wide">
            {formatDate(deck.modified_time)}
          </span>
          {showClientBadge && deck.client && (
            <span className="bg-hypr-cyan text-white text-[10px] px-2 py-0.5 rounded font-medium tracking-wide">
              {deck.client}
            </span>
          )}
        </div>
      </div>
      <div className="p-3 px-3.5">
        <p className="text-[13px] font-medium text-ink-900 dark:text-ink-50 leading-snug line-clamp-2 mb-1.5">
          {displayTitle}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-400 dark:text-ink-500 font-normal">
          <span className="truncate">{deck.owner_name || '—'}</span>
          <span className="text-ink-300 dark:text-ink-600">·</span>
          <span className="whitespace-nowrap">{formatBytes(deck.size_bytes)}</span>
        </div>
      </div>
    </button>
  );
}
