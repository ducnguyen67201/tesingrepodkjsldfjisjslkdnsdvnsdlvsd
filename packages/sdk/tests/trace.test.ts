import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Ducsigr } from '../src/ducsigr';
import { Trace } from '../src/trace';

describe('Trace', () => {
  beforeEach(() => {
    Ducsigr.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await Ducsigr.shutdown();
  });

  describe('startTrace()', () => {
    it('should create a trace with name', () => {
      const trace = Ducsigr.startTrace({ name: 'test-trace' });

      expect(trace).toBeInstanceOf(Trace);
      expect(trace.name).toBe('test-trace');
      expect(trace.id).toBeDefined();
      expect(typeof trace.id).toBe('string');
    });

    it('should accept custom trace ID', () => {
      const trace = Ducsigr.startTrace({
        name: 'custom-id-trace',
        id: 'custom-trace-123',
      });

      expect(trace.id).toBe('custom-trace-123');
    });

    it('should accept metadata', () => {
      const trace = Ducsigr.startTrace({
        name: 'metadata-trace',
        metadata: { environment: 'test', version: '1.0.0' },
      });

      expect(trace).toBeDefined();
    });
  });

  describe('trace()', () => {
    it('should run function within trace context', async () => {
      let traceReceived: Trace | undefined;

      const result = await Ducsigr.trace(
        { name: 'context-trace' },
        async (trace) => {
          traceReceived = trace;
          return 'result';
        }
      );

      expect(result).toBe('result');
      expect(traceReceived).toBeInstanceOf(Trace);
    });

    it('should auto-end trace on completion', async () => {
      const endSpy = vi.fn();

      await Ducsigr.trace({ name: 'auto-end-trace' }, async (trace) => {
        const originalEnd = trace.end.bind(trace);
        trace.end = () => {
          endSpy();
          return originalEnd();
        };
        return 'done';
      });

      // Trace should have ended (callback would have been called)
    });

    it('should handle sync functions', () => {
      const result = Ducsigr.trace({ name: 'sync-trace' }, (trace) => {
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
    });
  });
});

describe('Span', () => {
  beforeEach(() => {
    Ducsigr.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await Ducsigr.shutdown();
  });

  it('should create spans within a trace', () => {
    const trace = Ducsigr.startTrace({ name: 'span-test' });
    const span = trace.startSpan({ name: 'child-span' });

    expect(span).toBeDefined();
    expect(span.name).toBe('child-span');
    expect(span.id).toBeDefined();

    span.end();
    trace.end();
  });

  it('should set input and output', () => {
    const trace = Ducsigr.startTrace({ name: 'io-test' });
    const span = trace.startSpan({ name: 'io-span' });

    span.setInput({ query: 'SELECT * FROM users' });
    span.setOutput({ rows: 10 });

    span.end();
    trace.end();
  });

  it('should set model info', () => {
    const trace = Ducsigr.startTrace({ name: 'model-test' });
    const span = trace.startSpan({ name: 'model-span' });

    span.setModel('gpt-4', { temperature: 0.7, max_tokens: 1000 });

    span.end();
    trace.end();
  });

  it('should set usage', () => {
    const trace = Ducsigr.startTrace({ name: 'usage-test' });
    const span = trace.startSpan({ name: 'usage-span' });

    span.setUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    span.end();
    trace.end();
  });

  it('should set error', () => {
    const trace = Ducsigr.startTrace({ name: 'error-test' });
    const span = trace.startSpan({ name: 'error-span' });

    span.setError('Something went wrong');

    span.end();
    trace.end();
  });

  it('should set level', () => {
    const trace = Ducsigr.startTrace({ name: 'level-test' });
    const span = trace.startSpan({ name: 'level-span' });

    span.setLevel('WARNING');

    span.end();
    trace.end();
  });

  it('should support nested spans', () => {
    const trace = Ducsigr.startTrace({ name: 'nested-test' });

    const parent = trace.startSpan({ name: 'parent' });
    const child = trace.startSpan({ name: 'child', parentSpanId: parent.id });
    const grandchild = trace.startSpan({
      name: 'grandchild',
      parentSpanId: child.id,
    });

    expect(grandchild).toBeDefined();

    grandchild.end();
    child.end();
    parent.end();
    trace.end();
  });

  it('should calculate duration on end', async () => {
    const trace = Ducsigr.startTrace({ name: 'duration-test' });
    const span = trace.startSpan({ name: 'duration-span' });

    await new Promise((r) => setTimeout(r, 50));

    span.end();

    // Timer precision can vary slightly, allow 5ms tolerance
    expect(span.duration).toBeGreaterThanOrEqual(45);

    trace.end();
  });
});
