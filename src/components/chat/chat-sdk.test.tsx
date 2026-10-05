import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChat } from '@ai-sdk/react';
import {
  createUIMessageStreamResponse,
  DefaultChatTransport,
  type ChatInit,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { StreamdownMarkdown } from './MemoizedMarkdown';

function ChatHarness({ transport, onFinish, onError }: Pick<ChatInit<UIMessage>, 'transport' | 'onFinish' | 'onError'>) {
  const { messages, sendMessage, status, error } = useChat({ transport, onFinish, onError });
  const assistant = messages.filter(message => message.role === 'assistant').at(-1);
  const text = assistant?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('') ?? '';

  return (
    <>
      <button onClick={() => void sendMessage({ text: '检查 Guard 的版本' })}>Send</button>
      <output data-testid="status">{status}</output>
      <output data-testid="parts">{JSON.stringify(assistant?.parts ?? [])}</output>
      <StreamdownMarkdown content={text} isStreaming={status === 'streaming'} />
      {error && <p role="alert">{error.message}</p>}
    </>
  );
}

function createLocalTransport() {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const response = createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>({
      start(value) {
        controller = value;
      },
    }),
  });
  // Only replace the HTTP request: the SSE encoder, transport, hook and renderer are real.
  const fetch = vi.fn(async () => response);
  const transport = new DefaultChatTransport({ api: '/api/chat', fetch });

  return {
    transport,
    fetch,
    write(...chunks: UIMessageChunk[]) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    close() {
      controller.close();
    },
  };
}

describe('AI SDK React chat stream integration', () => {
  it('renders incremental Markdown and preserves completed tool parts in state and onFinish', async () => {
    const stream = createLocalTransport();
    const onFinish = vi.fn();
    const onError = vi.fn();
    render(<ChatHarness transport={stream.transport} onFinish={onFinish} onError={onError} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => {
      stream.write(
        { type: 'start', messageId: 'assistant-1' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: '正在检查 ' },
      );
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('streaming'));
    expect(screen.getByText('正在检查')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    const input = { edition_id: 'edition-1', updates: { status: 'sold' } };
    const output = { type: 'confirmation_card', ...input, requires_confirmation: true };
    await act(async () => {
      stream.write(
        { type: 'text-delta', id: 'text-1', delta: '**Guard**。' },
        { type: 'text-end', id: 'text-1' },
        { type: 'tool-input-available', toolCallId: 'confirm-1', toolName: 'generate_update_confirmation', input },
        { type: 'tool-output-available', toolCallId: 'confirm-1', output },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      );
      stream.close();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));

    expect(screen.getByText('Guard', { selector: 'strong' })).toBeInTheDocument();
    const expectedToolPart = {
      type: 'tool-generate_update_confirmation',
      toolCallId: 'confirm-1',
      state: 'output-available',
      input,
      output,
    };
    expect(JSON.parse(screen.getByTestId('parts').textContent ?? '[]')).toEqual(expect.arrayContaining([
      { type: 'text', text: '正在检查 **Guard**。', state: 'done' },
      expect.objectContaining(expectedToolPart),
    ]));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      isAbort: false,
      isDisconnect: false,
      isError: false,
      finishReason: 'stop',
      message: expect.objectContaining({ id: 'assistant-1', role: 'assistant' }),
      messages: [
        expect.objectContaining({ role: 'user', parts: [{ type: 'text', text: '检查 Guard 的版本' }] }),
        expect.objectContaining({ role: 'assistant', parts: expect.arrayContaining([expect.objectContaining(expectedToolPart)]) }),
      ],
    }));
    expect(stream.fetch).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces streamed errors and exits the streaming state while retaining partial text', async () => {
    const stream = createLocalTransport();
    const onFinish = vi.fn();
    const onError = vi.fn();
    render(<ChatHarness transport={stream.transport} onFinish={onFinish} onError={onError} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => {
      stream.write(
        { type: 'start', messageId: 'assistant-error' },
        { type: 'text-start', id: 'text-error' },
        { type: 'text-delta', id: 'text-error', delta: '已找到 Guard' },
        { type: 'error', errorText: 'Model temporarily unavailable' },
      );
      stream.close();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Model temporarily unavailable');
    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByText('已找到 Guard')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Model temporarily unavailable' }));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
    expect(stream.fetch).toHaveBeenCalledOnce();
  });
});
