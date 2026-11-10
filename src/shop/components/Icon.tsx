import { ICON } from '../lib/icons';

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? ''} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON[name] ?? '' }} />
  );
}

/** Category icons come from the admin panel as full <svg> markup (trusted, admin-authored). */
export function RawSvg({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
