import axios from 'axios';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import type {
  TSharedLinkStartupConfig,
  TSharedMessagesResponse,
  TMessage,
} from 'librechat-data-provider';
import type { AxiosResponse } from 'axios';
import { render, screen } from 'test/layout-test-utils';
import ShareView from '../ShareView';

let shareCounter = 0;

const createdAt = '2026-07-01T12:00:00.000Z';

function createMessage({
  messageId,
  parentMessageId,
  isCreatedByUser,
  text,
}: {
  messageId: string;
  parentMessageId: string | null;
  isCreatedByUser: boolean;
  text: string;
}): TMessage {
  return {
    text,
    createdAt,
    updatedAt: createdAt,
    title: 'Shared chat',
    conversationId: 'conversation-1',
    messageId,
    parentMessageId,
    isCreatedByUser,
    sender: isCreatedByUser ? 'anonymous' : 'assistant',
  };
}

function createSharedMessages(shareId: string): TSharedMessagesResponse {
  return {
    shareId,
    createdAt,
    updatedAt: createdAt,
    title: 'Shared chat',
    conversationId: 'conversation-1',
    messages: [
      createMessage({
        messageId: 'message-user',
        parentMessageId: null,
        isCreatedByUser: true,
        text: 'Hello',
      }),
      createMessage({
        messageId: 'message-assistant',
        parentMessageId: 'message-user',
        isCreatedByUser: false,
        text: 'Hi there',
      }),
    ],
  };
}

function renderShareView(registrationUrl?: string) {
  shareCounter += 1;
  const shareId = `share-${shareCounter}`;
  const startupConfig: TSharedLinkStartupConfig = {
    appTitle: 'LibreChat',
    ...(registrationUrl ? { registrationUrl } : {}),
  };
  const sharedMessages = createSharedMessages(shareId);

  jest.spyOn(axios, 'get').mockImplementation(<T,>(url: string): Promise<AxiosResponse<T>> => {
    if (url.endsWith('/config')) {
      return Promise.resolve({ data: startupConfig as T } as AxiosResponse<T>);
    }
    return Promise.resolve({ data: sharedMessages as T } as AxiosResponse<T>);
  });
  jest.spyOn(axios, 'post').mockRejectedValue({ status: 401 });

  window.history.pushState({}, '', `/share/${shareId}`);
  render(
    <Routes>
      <Route path="/share/:shareId" element={<ShareView />} />
    </Routes>,
  );
}

async function continueSharedChat() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /continue this chat/i }));
}

describe('ShareView', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the auth dialog when continuing a shared chat returns 401', async () => {
    renderShareView('https://xcity.example/register');

    await continueSharedChat();

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create an account or sign in to continue this conversation with your own messages.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('omits the register button when no registration URL is provided', async () => {
    renderShareView();

    await continueSharedChat();

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create your account' })).not.toBeInTheDocument();
  });
});
