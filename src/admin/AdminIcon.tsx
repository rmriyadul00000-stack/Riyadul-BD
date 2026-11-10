import { ICON } from './icons';

export function AdminIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] ?? '' }} />;
}
