import { describe, it, expect } from 'vitest';
import { extractLLMData } from '../src/utils/extract-llm';

describe('extractLLMData', () => {
  describe('OpenAI format', () => {
    it('should extract model from OpenAI response', () => {
      const response = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = extractLLMData(response);

      expect(result.model).toBe('gpt-4');
    });

    it('should extract usage from OpenAI response', () => {
      const response = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const result = extractLLMData(response);

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should extract output from OpenAI chat response', () => {
      const response = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
      };

      const result = extractLLMData(response);

      expect(result.output).toEqual({
        id: 'chatcmpl-123',
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello!' },
      });
    });
  });

  describe('Anthropic format', () => {
    it('should extract model from Anthropic response', () => {
      const response = {
        id: 'msg_123',
        model: 'claude-3-sonnet',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      const result = extractLLMData(response);

      expect(result.model).toBe('claude-3-sonnet');
    });

    it('should extract usage from Anthropic response', () => {
      const response = {
        id: 'msg_123',
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      const result = extractLLMData(response);

      expect(result.usage).toEqual({
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
      });
    });

    it('should extract output from Anthropic response', () => {
      const response = {
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        stop_reason: 'end_turn',
      };

      const result = extractLLMData(response);

      expect(result.output).toEqual({
        id: 'msg_123',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hello from Claude!' }],
      });
    });
  });

  describe('Google/Gemini format', () => {
    it('should extract usage from Gemini response', () => {
      const response = {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 8,
          totalTokenCount: 23,
        },
      };

      const result = extractLLMData(response);

      expect(result.usage).toEqual({
        promptTokens: 15,
        completionTokens: 8,
        totalTokens: 23,
      });
    });

    it('should extract output from Gemini response', () => {
      const response = {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }] },
            finishReason: 'STOP',
          },
        ],
      };

      const result = extractLLMData(response);

      expect(result.output).toEqual({
        content: { parts: [{ text: 'Hello!' }] },
        finishReason: 'STOP',
      });
    });
  });

  describe('Cohere format', () => {
    it('should extract usage from Cohere response', () => {
      const response = {
        text: 'Hello from Cohere!',
        generation_id: 'gen_123',
        meta: {
          tokens: {
            input_tokens: 12,
            output_tokens: 8,
          },
        },
      };

      const result = extractLLMData(response);

      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
      });
    });

    it('should extract output from Cohere response', () => {
      const response = {
        text: 'Hello from Cohere!',
        generation_id: 'gen_123',
      };

      const result = extractLLMData(response);

      expect(result.output).toEqual({
        text: 'Hello from Cohere!',
        generation_id: 'gen_123',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null input', () => {
      const result = extractLLMData(null);

      expect(result).toEqual({
        model: null,
        modelParameters: null,
        usage: null,
        output: null,
      });
    });

    it('should handle undefined input', () => {
      const result = extractLLMData(undefined);

      expect(result).toEqual({
        model: null,
        modelParameters: null,
        usage: null,
        output: null,
      });
    });

    it('should handle empty object', () => {
      const result = extractLLMData({});

      expect(result.model).toBeNull();
      expect(result.usage).toBeNull();
      expect(result.output).toBeNull();
    });

    it('should handle non-object input', () => {
      const result = extractLLMData('string');

      expect(result).toEqual({
        model: null,
        modelParameters: null,
        usage: null,
        output: null,
      });
    });
  });
});
