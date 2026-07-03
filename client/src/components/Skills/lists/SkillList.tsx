import { useState } from 'react';
import { ChevronRight, ScrollText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import { DashboardEmptyState } from '~/components/ui';
import { useLocalize } from '~/hooks';
import SkillListItem from './SkillListItem';
import { cn } from '~/utils';

interface SkillListProps {
  skills: TSkill[];
  isLoading: boolean;
  activeSkillId?: string;
}

/** Collapsible skill list. Active/inactive toggling lives in the detail view. */
export default function SkillList({ skills, isLoading, activeSkillId }: SkillListProps) {
  const localize = useLocalize();
  const [searchParams] = useSearchParams();
  const activeFile = searchParams.get('file');
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(activeSkillId ?? null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-2 pt-2">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px">
      {/* Section header */}
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-1.5"
          aria-expanded={sectionOpen}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-text-secondary transition-transform duration-200',
              sectionOpen && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-text-secondary">{localize('com_ui_my_skills')}</span>
        </button>
      </div>

      {/* Skill items */}
      {sectionOpen && (
        <div className="flex flex-col gap-px">
          {skills.length === 0 ? (
            <DashboardEmptyState
              icon={ScrollText}
              title={localize('com_ui_empty_skills_title')}
              description={localize('com_ui_empty_skills_desc')}
              ctaLabel={localize('com_ui_empty_skills_cta')}
              ctaTo="/skills/new"
              helpLabel={localize('com_ui_empty_skills_help')}
              helpHref="https://docs.xcity.ai/skills"
              className="py-6"
            />
          ) : (
            skills.map((skill) => (
              <SkillListItem
                key={skill._id}
                skill={skill}
                isActive={skill._id === activeSkillId}
                isExpanded={skill._id === expandedSkillId}
                activeFile={skill._id === activeSkillId ? activeFile : null}
                onToggleExpand={(id) => setExpandedSkillId((prev) => (prev === id ? null : id))}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
