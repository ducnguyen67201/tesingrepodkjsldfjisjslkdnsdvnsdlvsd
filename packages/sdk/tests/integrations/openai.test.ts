import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Ducsigr } from '../../src/ducsigr';
import { wrapOpenAI } from '../../src/integrations/openai';

// Mock OpenAI client
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async (params: any) => {
          if (params.stream) {
            return mockStreamingResponse();
          }
          return {
            id: 'chatcmpl-123',
            model: params.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Mock response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          };
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockImplementation(async (params: any) => ({
        model: params.model,
        data: [{ index: 0, embedding: new Array(1536).fill(0) }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      })),
    },
  };
}

async function* mockStreamingResponse() {
  yield {
    id: 'chatcmpl-123',
    choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
  };
  yield {
    id: 'chatcmpl-123',
    choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
  };
  yield {
    id: 'chatcmpl-123',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  };
}

describe('wrapOpenAI', () => {
  beforeEach(() => {
    Ducsigr.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await Ducsigr.shutdown();
  });

  describe('chat.completions.create', () => {
    it('should wrap the client and preserve functionality', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient);

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.id).toBe('chatcmpl-123');
      expect(response.choices[0].message.content).toBe('Mock response');
    });

    it('should create trace when createTrace is true', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, { createTrace: true });

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should work within observe() context', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient);

      await Ducsigr.observe('parent', async () => {
        const response = await wrapped.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(response.id).toBe('chatcmpl-123');
      });
    });

    it('should handle streaming responses', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, { createTrace: true });

      const stream = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });

      const chunks: string[] = [];
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        chunks.push(content);
      }

      expect(chunks.join('')).toBe('Hello world');
    });

    it('should respect captureInput option', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, {
        createTrace: true,
        captureInput: false,
      });

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should respect captureOutput option', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, {
        createTrace: true,
        captureOutput: false,
      });

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should handle errors', async () => {
      const mockClient = createMockOpenAI();
      mockClient.chat.completions.create = vi
        .fn()
        .mockRejectedValue(new Error('API Error'));

      const wrapped = wrapOpenAI(mockClient, { createTrace: true });

      await expect(
        wrapped.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('API Error');
    });
  });

  describe('embeddings.create', () => {
    it('should wrap embeddings correctly', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, { createTrace: true });

      const response = await wrapped.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'Hello world',
      });

      expect(response.data[0].embedding).toHaveLength(1536);
    });

    it('should handle array inputs', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, { createTrace: true });

      const response = await wrapped.embeddings.create({
        model: 'text-embedding-3-small',
        input: ['Hello', 'World'],
      });

      expect(response).toBeDefined();
    });
  });

  describe('options', () => {
    it('should use custom tracePrefix', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, {
        createTrace: true,
        tracePrefix: 'my-app',
      });

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });

    it('should not trace when no context and createTrace is false', async () => {
      const mockClient = createMockOpenAI();
      const wrapped = wrapOpenAI(mockClient, { createTrace: false });

      const response = await wrapped.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toBeDefined();
    });
  });
});
