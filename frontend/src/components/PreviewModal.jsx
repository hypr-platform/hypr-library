import { useState, useEffect } from 'react';
import { Icon } from '../lib/icons';
import { gradientFor, formatBytes, formatDate } from '../lib/utils';
import { HyprLogo } from './HyprLogo';

export function PreviewModal({ deck, onClose }) {
  const [copied, setCopied] = useState(false);
  const [iframeError, setIframeError] = useState(false);

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

  // Constrói URL de embed do Google Slides
  const slidesEmbedUrl = deck.drive_url
    ? deck.drive_url.replace('/edit', '/preview').replace('/view', '/preview')
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-ink-800 rounded-2xl border border-ink-200 dark:border-ink-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink-100 dark:border-ink-700 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-hypr-cyan font-medium tracking-[0.18em] mb-1.5 flex items-center gap-1.5">
              <div className="w-0.5 h-3 bg-hypr-cyan"></div>
              {deck.client?.toUpperCase()}
            </div>
            <h2 className="text-[16px] font-medium text-ink-900 dark:text-ink-50 leading-snug">
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
          <div className="mx-6 mt-6 rounded-lg overflow-hidden border border-ink-100 dark:border-ink-700">
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

          {/* Metadata */}
          <div className="px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-4">
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
        <div className="px-6 py-4 border-t border-ink-100 dark:border-ink-700 flex items-center gap-2">
          <a
            href={deck.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 h-9 rounded-md bg-hypr-cyan hover:bg-hypr-cyan-dark text-white text-[13px] font-medium flex items-center gap-1.5 transition-colors tracking-wide"
          >
            <Icon.ExternalLink /> Abrir no Drive
          </a>
          <button
            onClick={copyLink}
            className="px-4 h-9 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-700/40 text-ink-700 dark:text-ink-100 text-[13px] font-medium flex items-center gap-1.5 transition-colors"
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

function mimeLabel(mime) {
  if (!mime) return '—';
  if (mime.includes('presentation')) return 'Google Slides';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('powerpoint')) return 'PowerPoint';
  return mime;
}
