import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { cn } from '~/utils';

export interface DashboardEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  ctaLabel: string;
  ctaTo?: string;
  onCta?: () => void;
  helpLabel: string;
  /** External URL — opens in new tab. Use helpTo for internal routes. */
  helpHref?: string;
  /** Internal route — navigates in-app. */
  helpTo?: string;
  onHelp?: () => void;
  className?: string;
}

export default function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaTo,
  onCta,
  helpLabel,
  helpHref,
  helpTo,
  onHelp,
  className,
}: DashboardEmptyStateProps) {
  const navigate = useNavigate();

  const handleCta = () => {
    if (onCta) {
      onCta();
    } else if (ctaTo) {
      navigate(ctaTo);
    }
  };

  const handleHelp = () => {
    if (onHelp) {
      onHelp();
    } else if (helpTo) {
      navigate(helpTo);
    }
  };

  const helpEl = helpHref ? (
    <a
      href={helpHref}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
    >
      {helpLabel}
    </a>
  ) : helpTo || onHelp ? (
    <button
      type="button"
      className="mt-3 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
      onClick={handleHelp}
    >
      {helpLabel}
    </button>
  ) : null;

  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-surface-tertiary">
        <Icon className="size-8 text-text-primary" aria-hidden="true" />
      </div>
      <h2 className="text-[17px] font-semibold leading-tight text-text-primary">{title}</h2>
      {description && (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">{description}</p>
      )}
      <Button type="button" variant="submit" className="mt-6" onClick={handleCta}>
        {ctaLabel}
      </Button>
      {helpEl}
    </div>
  );
}
