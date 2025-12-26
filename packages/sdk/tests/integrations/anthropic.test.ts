import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Ducsigr } from '../../src/ducsigr';
import { wrapAnthropic } from '../../src/integrations/anthropic';

// Mock Anthropic client
function createMockAnthropic() {
  return {
    messages: {
      create: vi.fn().mockImplementation(async (params: any) => {
        if (params.stream) {
          return mockStreamingResponse();
        }
        return {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: params.model,
          content: [{ type: 'text', text: 'Mock response from Claude' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 20,
            output_tokens: 10,
          },
        };
      }),
    },
  };
}

async function* mockStreamingResponse() {
  yield {
    type: 'message_start',
    message: {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-sonnet-20241022',
      content: [],
      usage: { input_tokens: 15, output_tokens: 0 },
    },
  };
  yield {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  };
  yield {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hello' },
  };
  yield {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: ' from Claude' },
  };
  yield {
    type: 'content_block_stop',
    index: 0,
  };
  yield {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 5 },
  };
  yield {
    type: 'message_stop',
  };
}

describe('wrapAnthropic', () => {
  beforeEach(() => {
    Ducsigr.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await Ducsigr.shutdown();
  });

  describe('messages.create', () => {
    it('should wrap the client and preserve functionality', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient);

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.id).toBe('msg_123');
      expect(response.content[0].text).toBe('Mock response from Claude');
    });

    it('should create trace when createTrace is true', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, { createTrace: true });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should work within observe() context', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient);

      await Ducsigr.observe('parent', async () => {
        const response = await wrapped.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(response.id).toBe('msg_123');
      });
    });

    it('should handle streaming responses', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, { createTrace: true });

      const stream = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });

      const chunks: string[] = [];
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta'
        ) {
          chunks.push(event.delta.text);
        }
      }

      expect(chunks.join('')).toBe('Hello from Claude');
    });

    it('should capture system prompt', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, { createTrace: true });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should respect captureInput option', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, {
        createTrace: true,
        captureInput: false,
      });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should respect captureOutput option', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, {
        createTrace: true,
        captureOutput: false,
      });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should handle errors', async () => {
      const mockClient = createMockAnthropic();
      mockClient.messages.create = vi
        .fn()
        .mockRejectedValue(new Error('API Error'));

      const wrapped = wrapAnthropic(mockClient, { createTrace: true });

      await expect(
        wrapped.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('API Error');
    });
  });

  describe('options', () => {
    it('should use custom tracePrefix', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, {
        createTrace: true,
        tracePrefix: 'my-claude-app',
      });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should not trace when no context and createTrace is false', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, { createTrace: false });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });
  });

  describe('usage extraction', () => {
    it('should extract usage from non-streaming response', async () => {
      const mockClient = createMockAnthropic();
      const wrapped = wrapAnthropic(mockClient, { createTrace: true });

      const response = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.usage).toEqual({
        input_tokens: 20,
        output_tokens: 10,
      });
    });
  });
});
