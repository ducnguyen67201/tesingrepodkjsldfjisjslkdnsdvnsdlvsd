/**
 * Basic example demonstrating the Ducsigr SDK
 *
 * Run with: npx tsx examples/basic.ts
 */
import { Ducsigr } from '../src/index';

// Initialize the SDK
Ducsigr.init({
  apiKey: 'co_test_key', // Use your actual API key
  endpoint: 'http://localhost:8080', // Local ingest service
  debug: true,
});

async function main() {
  console.log('Starting trace...\n');

  // Create a trace
  const trace = Ducsigr.startTrace({
    name: 'example-trace',
    metadata: { environment: 'development' },
  });

  // Create a span
  const span1 = trace.startSpan({ name: 'fetch-data' });
  span1.setInput({ userId: '123' });

  // Simulate some work
  await sleep(100);

  span1.setOutput({ user: { id: '123', name: 'Test User' } });
  span1.end();

  // Create a nested span (auto-parented)
  const span2 = trace.startSpan({ name: 'process-data' });
  span2.setModel('gpt-4', { temperature: 0.7 });

  // Simulate LLM call
  await sleep(200);

  span2.setOutput({ result: 'Processed successfully' });
  span2.setUsage({
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  });
  span2.end();

  // End the trace (sends to server)
  trace.end();

  console.log('\nTrace completed!');
  console.log(`Trace ID: ${trace.id}`);
  console.log(`Spans: ${trace.spanCount}`);

  // Flush and shutdown
  await Ducsigr.flush();
  await Ducsigr.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
