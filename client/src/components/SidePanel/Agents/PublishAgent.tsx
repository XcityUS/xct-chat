import { Store } from 'lucide-react';
import { useToastContext, Button } from '@librechat/client';
import { usePublishAgentMutation } from '~/data-provider';
import { isEphemeralAgent } from '~/common';
import { useLocalize } from '~/hooks';

/**
 * XCT fork: publish the agent to the XCity gateway marketplace under the
 * signed-in user's identity (see FORK-CHANGES.md). Re-publishing after edits
 * updates the same marketplace listing.
 */
export default function PublishAgent({ agent_id }: { agent_id: string }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const publishAgent = usePublishAgentMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_agent_published'),
        status: 'success',
      });
    },
    onError: (error) => {
      console.error(error);
      showToast({
        message: localize('com_ui_agent_publish_error'),
        status: 'error',
      });
    },
  });

  if (isEphemeralAgent(agent_id)) {
    return null;
  }

  const handlePublish = () => {
    publishAgent.mutate({ agent_id });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={localize('com_ui_publish_agent')}
      title={localize('com_ui_publish_agent')}
      type="button"
      disabled={publishAgent.isLoading}
      onClick={handlePublish}
    >
      <div className="flex w-full items-center justify-center gap-2 text-primary">
        <Store className="size-4" />
      </div>
    </Button>
  );
}
