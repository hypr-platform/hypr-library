import { Icon } from '../lib/icons';
import { gradientFor, cleanTitle, formatBytes, formatDate } from '../lib/utils';
import { HyprLogo } from './HyprLogo';

export function DeckCard({ deck, onClick, showClientBadge }) {
  const gradient = gradientFor(deck.title);
  const displayTitle = cleanTitle(deck.title);

  return (
    <button
      onClick={onClick}
      className="group text-left bg-white dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700/60 rounded-xl overflow-hidden hover:border-hypr-cyan dark:hover:border-hypr-cyan transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(45,160,222,0.08)] animate-scale-in"
    >
      <div
        className="aspect-[16/10] thumb-gradient relative flex items-center justify-center overflow-hidden"
        style={
          deck.thumbnail_url
            ? { backgroundImage: `url(${deck.thumbnail_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: gradient }
        }
      >
        {!deck.thumbnail_url && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent group-hover:from-black/10 transition-all" />
            <div className="text-white/30 group-hover:text-white/50 transition-colors relative z-10">
              <Icon.Presentation />
            </div>
          </>
        )}
        <div className="absolute top-2 right-2.5 hypr-logo text-[9px] text-white/40 group-hover:text-white/60 transition-colors">
          HYPR°
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
          <span className="bg-black/40 backdrop-blur-sm text-white/90 text-[10px] px-2 py-0.5 rounded font-normal tracking-wide">
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
