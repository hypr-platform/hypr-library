export function HyprLogo({ size = 'sm', className = '' }) {
  const sizes = { xs: 'text-xs', sm: 'text-sm', md: 'text-base', lg: 'text-lg' };
  return (
    <div className={`hypr-logo ${sizes[size]} flex items-center gap-0.5 ${className}`}>
      <span className="text-ink-900 dark:text-white">HYPR</span>
      <span
        className="text-ink-900 dark:text-white"
        style={{ fontSize: '0.6em', verticalAlign: 'super', marginLeft: '1px' }}
      >
        °
      </span>
    </div>
  );
}
