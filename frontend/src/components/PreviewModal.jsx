import { useState, useEffect } from 'react';
import { Icon } from '../lib/icons.jsx';
import { gradientFor, formatBytes, formatDate } from '../lib/utils.js';
import { HyprLogo } from './HyprLogo.jsx';
import { api } from '../lib/api.js';

export function PreviewModal({ deck, onClose, initialSlide = null }) {
  const [copied, setCopied] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [tags, setTags] = useState([]);
  const [activeSlide, setActiveSlide] = useState(null); // objectId do slide clicado

  // Carrega tags por slide do deck
  useEffect(() => {
    if (!deck?.deck_id) return;
    let cancelled = false;
    setTags([]);
    setActiveSlide(initialSlide || null);
    api
      .deckTags(deck.deck_id)
      .then((r) => !cancelled && setTags(r?.tags || []))
      .catch(() => !cancelled && setTags([]));
    return () => {
      cancelled = true;
    };
  }, [deck?.deck_id, initialSlide]);

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!deck) return null;

  const copyLink = () => {
    navigator.clipboard.writeText(deck.drive_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Constrói URL de embed do Google Slides (com deep-link pro slide ativo)
  const baseEmbedUrl = deck.drive_url
    ? deck.drive_url.replace('/edit', '/preview').replace('/view', '/preview')
    : null;
  const slidesEmbedUrl =
    baseEmbedUrl && activeSlide
      ? `${baseEmbedUrl.split('#')[0]}#slide=id.${activeSlide}`
      : baseEmbedUrl;

  // Agrupa tags por categoria, sem repetir nome; guarda o 1º slide de cada tag
  const grouped = groupTags(tags);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center p-3 lg:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-ink-800 rounded-2xl border border-ink-200 dark:border-ink-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 lg:px-6 py-4 border-b border-ink-100 dark:border-ink-700 flex items-start justify-between gap-3 lg:gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-hypr-cyan font-medium tracking-[0.18em] mb-1.5 flex items-center gap-1.5">
              <div className="w-0.5 h-3 bg-hypr-cyan"></div>
              {deck.client?.toUpperCase()}
            </div>
            <h2 className="text-[15px] lg:text-[16px] font-medium text-ink-900 dark:text-ink-50 leading-snug">
              {deck.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-ink-100 dark:hover:bg-ink-700 flex items-center justify-center text-ink-500 dark:text-ink-300 shrink-0"
            aria-label="Fechar"
          >
            <Icon.X />
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="mx-4 lg:mx-6 mt-4 lg:mt-6 rounded-lg overflow-hidden border border-ink-100 dark:border-ink-700">
            {slidesEmbedUrl && !iframeError ? (
              <iframe
                src={slidesEmbedUrl}
                className="w-full aspect-[16/9] bg-ink-100 dark:bg-ink-900"
                allowFullScreen
                onError={() => setIframeError(true)}
                title={deck.title}
              />
            ) : (
              <div
                className="aspect-[16/9] flex items-center justify-center text-white/60 relative"
                style={{ background: gradientFor(deck.title) }}
              >
                <div className="absolute top-3 right-4 hypr-logo text-[10px] text-white/50">
                  HYPR°
                </div>
                <div className="text-center">
                  <Icon.Presentation />
                  <p className="text-xs mt-2 font-normal">
                    Preview indisponível
                  </p>
                  <p className="text-[10px] mt-1 text-white/40 font-light">
                    Abre no Drive pra visualizar
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tags por slide */}
          {(grouped.solucao.length || grouped.feature.length || grouped.audiencia.length) > 0 && (
            <div className="px-4 lg:px-6 pt-5 flex flex-col gap-3">
              <TagRow
                label="SOLUÇÕES & FEATURES"
                items={[...grouped.solucao, ...grouped.feature]}
                tone="cyan"
                active={activeSlide}
                onPick={setActiveSlide}
              />
              <TagRow
                label="AUDIÊNCIAS"
                items={grouped.audiencia}
                tone="amber"
                active={activeSlide}
                onPick={setActiveSlide}
              />
            </div>
          )}

          {/* Metadata */}
          <div className="px-4 lg:px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-4">
            <MetaField
              icon={<Icon.Clock />}
              label="MODIFICADO"
              value={formatDate(deck.modified_time)}
            />
            <MetaField
              icon={<Icon.User />}
              label="AUTOR"
              value={deck.owner_name || '—'}
            />
            <MetaField
              icon={<Icon.FileText />}
              label="TAMANHO"
              value={formatBytes(deck.size_bytes)}
            />
            <MetaField
              icon={<Icon.Sparkles className="w-3 h-3" />}
              label="TIPO"
              value={mimeLabel(deck.mime_type)}
              iconColor="text-hypr-cyan"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 lg:px-6 py-4 border-t border-ink-100 dark:border-ink-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <a
            href={deck.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 h-10 sm:h-9 rounded-md bg-hypr-cyan hover:bg-hypr-cyan-dark text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors tracking-wide"
          >
            <Icon.ExternalLink /> Abrir no Drive
          </a>
          <button
            onClick={copyLink}
            className="px-4 h-10 sm:h-9 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-700/40 text-ink-700 dark:text-ink-100 text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon.Copy /> {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaField({ icon, label, value, iconColor = 'text-ink-400' }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`${iconColor} mt-0.5`}>{icon}</div>
      <div>
        <div className="text-[9px] uppercase tracking-[0.16em] text-ink-400 font-medium">
          {label}
        </div>
        <div className="text-[13px] text-ink-900 dark:text-ink-50 font-normal mt-0.5">
          {value}
        </div>
      </div>
    </div>
  );
}

function groupTags(tags) {
  const out = { solucao: [], feature: [], audiencia: [] };
  const seen = new Set();
  for (const t of tags) {
    if (!out[t.category]) continue;
    const key = `${t.category}|${t.tag.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out[t.category].push({
      tag: t.tag,
      detail: t.detail,
      slideIndex: t.slide_index,
      objectId: t.slide_object_id,
    });
  }
  return out;
}

function TagRow({ label, items, tone, active, onPick }) {
  if (!items.length) return null;
  const toneCls =
    tone === 'amber'
      ? 'border-amber-300/60 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20'
      : 'border-hypr-cyan/40 text-hypr-cyan-dark dark:text-hypr-cyan hover:bg-hypr-cyan/5';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-ink-400 font-medium mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const isActive = active && it.objectId === active;
          return (
            <button
              key={`${it.tag}-${it.slideIndex}`}
              type="button"
              title={`${it.detail ? it.detail + ' · ' : ''}slide ${it.slideIndex}`}
              onClick={() => it.objectId && onPick(isActive ? null : it.objectId)}
              className={`px-2 h-6 rounded-md border text-[11px] font-medium transition-colors ${toneCls} ${
                isActive ? 'ring-1 ring-current' : ''
              } ${it.objectId ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {it.tag}
              <span className="ml-1 text-[9px] opacity-60">#{it.slideIndex}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function mimeLabel(mime) {
  if (!mime) return '—';
  if (mime.includes('presentation')) return 'Google Slides';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('powerpoint')) return 'PowerPoint';
  return mime;
}
