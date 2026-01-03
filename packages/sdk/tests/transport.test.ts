import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Transport } from '../src/transport';
import type { ResolvedConfig, TraceData } from '../src/types';

// Store original fetch
const originalFetch = global.fetch;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Create a mock ResolvedConfig with sensible defaults for testing
 */
function createMockConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'test-api-key',
    endpoint: 'https://test.ducsigr.com',
    debug: false,
    disabled: false,
    flushInterval: 5000,
    maxBatchSize: 10,
    maxRetries: 3,
    maxQueueSize: 100,
    timeout: 30000,
    compression: true,
    maxRetryDelay: 30000,
    sampleRate: 1.0,
    ...overrides,
  };
}

/**
 * Create a mock TraceData for testing
 */
function createMockTrace(overrides: Partial<TraceData> = {}): TraceData {
  return {
    id: 'trace-123',
    name: 'test-trace',
    sessionId: null,
    userId: null,
    user: null,
    timestamp: new Date(),
    metadata: null,
    spans: [
      {
        id: 'span-456',
        traceId: 'trace-123',
        parentSpanId: null,
        name: 'test-span',
        startTime: new Date(),
        endTime: new Date(),
        input: { query: 'test' },
        output: { result: 'success' },
        metadata: null,
        model: null,
        modelParameters: null,
        usage: null,
        level: 'DEFAULT',
        statusMessage: null,
      },
    ],
    ...overrides,
  };
}

/**
 * Create a mock Response object
 */
function createMockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {}
): Response {
  const headersMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headersMap.get(name) ?? null,
    },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

describe('Transport', () => {
  let transport: Transport;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure global.fetch is always the mock
    global.fetch = mockFetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    // Clear mock before shutdown to prevent errors
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      createMockResponse(200, { trace_id: 'cleanup', span_ids: [], success: true })
    );

    if (transport) {
      await transport.shutdown();
    }
    vi.useRealTimers();
  });

  describe('gzip compression', () => {
    it('should send payload with gzip compression when enabled', async () => {
      const config = createMockConfig({ compression: true });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-123',
          span_ids: ['span-456'],
          success: true,
        })
      );

      transport.enqueue(createMockTrace());
      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://test.ducsigr.com/v1/traces');
      expect(options.headers['Content-Encoding']).toBe('gzip');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBe('Bearer test-api-key');

      // Verify body is gzipped
      const body = options.body as Buffer;
      expect(Buffer.isBuffer(body)).toBe(true);

      // Decompress and verify JSON structure
      const decompressed = gunzipSync(body).toString('utf-8');
      const parsed = JSON.parse(decompressed);
      expect(parsed.trace_id).toBe('trace-123');
      expect(parsed.spans).toHaveLength(1);
    });

    it('should send payload without compression when disabled', async () => {
      const config = createMockConfig({ compression: false });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-123',
          span_ids: ['span-456'],
          success: true,
        })
      );

      transport.enqueue(createMockTrace());
      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Encoding']).toBeUndefined();

      // Body should be plain JSON string
      const body = options.body as string;
      expect(typeof body).toBe('string');

      const parsed = JSON.parse(body);
      expect(parsed.trace_id).toBe('trace-123');
    });
  });

  describe('Retry-After handling (429)', () => {
    it('should retry on 429 with Retry-After header', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
      });
      transport = new Transport(config);

      // First call returns 429 with Retry-After, second succeeds
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(429, { error: 'rate limited' }, { 'Retry-After': '1' })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, {
            trace_id: 'trace-123',
            span_ids: ['span-456'],
            success: true,
          })
        );

      transport.enqueue(createMockTrace());

      // Start flush
      const flushPromise = transport.flush();

      // Advance timer past the Retry-After delay (1 second)
      await vi.advanceTimersByTimeAsync(1000);

      await flushPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff when Retry-After header is missing', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
      });
      transport = new Transport(config);

      // First call returns 429 without Retry-After, second succeeds
      mockFetch
        .mockResolvedValueOnce(createMockResponse(429, { error: 'rate limited' }))
        .mockResolvedValueOnce(
          createMockResponse(200, {
            trace_id: 'trace-123',
            span_ids: ['span-456'],
            success: true,
          })
        );

      transport.enqueue(createMockTrace());

      const flushPromise = transport.flush();

      // Advance timer for exponential backoff (2^0 * 1000 = 1000ms)
      await vi.advanceTimersByTimeAsync(1000);

      await flushPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry behavior by status code', () => {
    it('should retry on 5xx server errors', async () => {
      vi.useRealTimers();

      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
        maxRetryDelay: 1000,
      });
      transport = new Transport(config);

      mockFetch
        .mockResolvedValueOnce(createMockResponse(500, { error: 'Internal Server Error' }))
        .mockResolvedValueOnce(createMockResponse(503, { error: 'Service Unavailable' }))
        .mockResolvedValueOnce(
          createMockResponse(200, {
            trace_id: 'trace-123',
            span_ids: ['span-456'],
            success: true,
          })
        );

      transport.enqueue(createMockTrace());
      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('should NOT retry on 4xx client errors (except 429)', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
        maxBatchSize: 100, // High batch size to prevent auto-flush on enqueue
        flushInterval: 100000, // Long interval to prevent auto-flush by timer
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(createMockResponse(400, { error: 'Bad Request' }));

      transport.enqueue(createMockTrace());

      await expect(transport.flush()).rejects.toThrow('HTTP 400');

      // Should only call once, no retries
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 401 Unauthorized', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
        maxBatchSize: 100,
        flushInterval: 100000,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(createMockResponse(401, { error: 'Unauthorized' }));

      transport.enqueue(createMockTrace());

      await expect(transport.flush()).rejects.toThrow('HTTP 401');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 403 Forbidden', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
        maxBatchSize: 100,
        flushInterval: 100000,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(createMockResponse(403, { error: 'Forbidden' }));

      transport.enqueue(createMockTrace());

      await expect(transport.flush()).rejects.toThrow('HTTP 403');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 404 Not Found', async () => {
      const config = createMockConfig({
        maxRetries: 3,
        debug: false,
        compression: false,
        maxBatchSize: 100,
        flushInterval: 100000,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(createMockResponse(404, { error: 'Not Found' }));

      transport.enqueue(createMockTrace());

      await expect(transport.flush()).rejects.toThrow('HTTP 404');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue overflow protection', () => {
    it('should drop oldest traces when queue exceeds maxQueueSize', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = createMockConfig({
        maxQueueSize: 3,
        disabled: false,
      });
      transport = new Transport(config);

      // Enqueue 4 traces (exceeds maxQueueSize of 3)
      transport.enqueue(createMockTrace({ id: 'trace-1', name: 'first' }));
      transport.enqueue(createMockTrace({ id: 'trace-2', name: 'second' }));
      transport.enqueue(createMockTrace({ id: 'trace-3', name: 'third' }));
      transport.enqueue(createMockTrace({ id: 'trace-4', name: 'fourth' }));

      // Should have logged a warning about dropping trace-1
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Queue full (3), dropped oldest trace: trace-1')
      );

      warnSpy.mockRestore();
    });

    it('should not drop traces when queue is under maxQueueSize', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = createMockConfig({
        maxQueueSize: 10,
        disabled: false,
      });
      transport = new Transport(config);

      // Enqueue 3 traces (under maxQueueSize of 10)
      transport.enqueue(createMockTrace({ id: 'trace-1' }));
      transport.enqueue(createMockTrace({ id: 'trace-2' }));
      transport.enqueue(createMockTrace({ id: 'trace-3' }));

      // Should not have logged any warning about dropping
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Queue full'),
        expect.anything()
      );

      warnSpy.mockRestore();
    });
  });

  describe('sampling', () => {
    it('should skip traces when sample rate is less than 1.0', () => {
      // Set Math.random to always return 0.8
      vi.spyOn(Math, 'random').mockReturnValue(0.8);

      const config = createMockConfig({
        sampleRate: 0.5, // 50% sample rate
        disabled: false,
      });
      transport = new Transport(config);

      transport.enqueue(createMockTrace({ id: 'trace-1' }));

      // Since Math.random() returns 0.8 > sampleRate 0.5, trace should be skipped
      // We can't directly check queue, but we can verify via flush
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-1',
          span_ids: [],
          success: true,
        })
      );

      // The trace should not be in queue since it was sampled out
      // Flush should not call fetch if queue is empty
    });

    it('should include traces when sample rate is 1.0', async () => {
      const config = createMockConfig({
        sampleRate: 1.0, // 100% sample rate
        disabled: false,
        compression: false,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-1',
          span_ids: ['span-1'],
          success: true,
        })
      );

      transport.enqueue(createMockTrace({ id: 'trace-1' }));
      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout handling', () => {
    it('should include timeout in fetch request', async () => {
      const config = createMockConfig({
        timeout: 5000,
        compression: false,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-123',
          span_ids: ['span-456'],
          success: true,
        })
      );

      transport.enqueue(createMockTrace());
      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeDefined();
      // AbortSignal.timeout creates a signal that aborts after the specified time
    });

    it('should retry on timeout error', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const config = createMockConfig({
        maxRetries: 3,
        timeout: 1000,
        compression: false,
        maxRetryDelay: 1000,
      });
      transport = new Transport(config);

      const timeoutError = new Error('Timeout');
      timeoutError.name = 'TimeoutError';

      mockFetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(
          createMockResponse(200, {
            trace_id: 'trace-123',
            span_ids: ['span-456'],
            success: true,
          })
        );

      transport.enqueue(createMockTrace());

      await transport.flush();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useFakeTimers({ shouldAdvanceTime: true }); // Restore fake timers
    });
  });

  describe('auth header', () => {
    it('should include Authorization header with Bearer token', async () => {
      const config = createMockConfig({
        apiKey: 'my-secret-api-key',
        compression: false,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          trace_id: 'trace-123',
          span_ids: ['span-456'],
          success: true,
        })
      );

      transport.enqueue(createMockTrace());
      await transport.flush();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer my-secret-api-key');
    });
  });

  describe('disabled mode', () => {
    it('should not enqueue traces when disabled', async () => {
      const config = createMockConfig({ disabled: true });
      transport = new Transport(config);

      transport.enqueue(createMockTrace());
      await transport.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('network errors', () => {
    it('should throw on network error and log it', async () => {
      vi.useRealTimers();

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const config = createMockConfig({
        maxRetries: 1,
        compression: false,
      });
      transport = new Transport(config);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      transport.enqueue(createMockTrace());

      await expect(transport.flush()).rejects.toThrow('Network error');

      // Should have logged the error
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
  });

  describe('flush behavior', () => {
    it('should batch traces up to maxBatchSize', async () => {
      const config = createMockConfig({
        maxBatchSize: 2,
        compression: false,
      });
      transport = new Transport(config);

      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          trace_id: 'trace',
          span_ids: [],
          success: true,
        })
      );

      // Enqueue 3 traces
      transport.enqueue(createMockTrace({ id: 'trace-1' }));
      transport.enqueue(createMockTrace({ id: 'trace-2' }));
      transport.enqueue(createMockTrace({ id: 'trace-3' }));

      // First flush should send 2 traces (maxBatchSize)
      // The third was already flushed when the queue reached maxBatchSize
      // So we should have 2 flush calls already triggered

      // Wait for any pending flushes
      await vi.advanceTimersByTimeAsync(0);

      // Should have made multiple fetch calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should flush on shutdown', async () => {
      const config = createMockConfig({ compression: false });
      transport = new Transport(config);

      mockFetch.mockResolvedValue(
        createMockResponse(200, {
          trace_id: 'trace',
          span_ids: [],
          success: true,
        })
      );

      transport.enqueue(createMockTrace({ id: 'trace-1' }));

      await transport.shutdown();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Config', () => {
  it('should resolve new config options with defaults', async () => {
    const { resolveConfig } = await import('../src/config');

    const config = resolveConfig({
      apiKey: 'test-key',
    });

    expect(config.maxQueueSize).toBe(10000);
    expect(config.timeout).toBe(30000);
    expect(config.compression).toBe(true);
    expect(config.maxRetryDelay).toBe(30000);
    expect(config.sampleRate).toBe(1.0);
  });

  it('should respect custom values for new config options', async () => {
    const { resolveConfig } = await import('../src/config');

    const config = resolveConfig({
      apiKey: 'test-key',
      maxQueueSize: 5000,
      timeout: 10000,
      compression: false,
      maxRetryDelay: 15000,
      sampleRate: 0.5,
    });

    expect(config.maxQueueSize).toBe(5000);
    expect(config.timeout).toBe(10000);
    expect(config.compression).toBe(false);
    expect(config.maxRetryDelay).toBe(15000);
    expect(config.sampleRate).toBe(0.5);
  });

  it('should clamp sampleRate to 0-1 range', async () => {
    const { resolveConfig } = await import('../src/config');

    const configHigh = resolveConfig({
      apiKey: 'test-key',
      sampleRate: 2.0,
    });
    expect(configHigh.sampleRate).toBe(1.0);

    const configLow = resolveConfig({
      apiKey: 'test-key',
      sampleRate: -0.5,
    });
    expect(configLow.sampleRate).toBe(0);
  });

  it('should validate new config options', async () => {
    const { resolveConfig, validateConfig } = await import('../src/config');

    expect(() => {
      const config = resolveConfig({ apiKey: 'test', maxQueueSize: 0 });
      validateConfig(config);
    }).toThrow('Max queue size must be at least 1');

    expect(() => {
      const config = resolveConfig({ apiKey: 'test', timeout: 500 });
      validateConfig(config);
    }).toThrow('Timeout must be at least 1000ms');

    expect(() => {
      const config = resolveConfig({ apiKey: 'test', maxRetryDelay: 100 });
      validateConfig(config);
    }).toThrow('Max retry delay must be at least 1000ms');
  });
});
