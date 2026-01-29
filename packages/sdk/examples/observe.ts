/**
 * Example demonstrating the observe() wrapper API
 *
 * Run with: npx tsx examples/observe.ts
 */
import { Ducsigr } from '../src/index';

// Initialize the SDK
Ducsigr.init({
  apiKey: 'co_test_key',
  endpoint: 'http://localhost:8080',
  debug: true,
});

// Simulate an OpenAI response
function mockOpenAIResponse() {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello! How can I help you?' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
    },
  };
}

// Simulate an Anthropic response
function mockAnthropicResponse() {
  return {
    id: 'msg_123',
    type: 'message',
    model: 'claude-3-sonnet',
    content: [{ type: 'text', text: 'Hello from Claude!' }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 12,
      output_tokens: 6,
    },
  };
}

async function main() {
  console.log('\n=== Testing observe() API ===\n');

  // Test 1: Simple observe
  console.log('Test 1: Simple observe()');
  const result1 = await Ducsigr.observe('fetch-data', async () => {
    await sleep(50);
    return { users: ['alice', 'bob'] };
  });
  console.log('Result:', result1);

  // Test 2: observe() with LLM (auto-extracts tokens)
  console.log('\nTest 2: observe() with type="generation" (OpenAI format)');
  const result2 = await Ducsigr.observe(
    {
      name: 'openai-call',
      type: 'generation',
    },
    async () => {
      await sleep(100);
      return mockOpenAIResponse();
    }
  );
  console.log('Model:', result2.model);
  console.log('Tokens:', result2.usage);

  // Test 3: observe() with Anthropic format
  console.log('\nTest 3: observe() with type="generation" (Anthropic format)');
  const result3 = await Ducsigr.observe(
    {
      name: 'anthropic-call',
      type: 'generation',
    },
    async () => {
      await sleep(100);
      return mockAnthropicResponse();
    }
  );
  console.log('Model:', result3.model);
  console.log('Content:', result3.content);

  // Test 4: Auto-nesting
  console.log('\nTest 4: Auto-nesting');
  await Ducsigr.observe('parent-operation', async () => {
    console.log('  Inside parent');

    await Ducsigr.observe('child-1', async () => {
      console.log('    Inside child-1');
      await sleep(30);
    });

    await Ducsigr.observe('child-2', async () => {
      console.log('    Inside child-2');

      await Ducsigr.observe('grandchild', async () => {
        console.log('      Inside grandchild');
        await sleep(20);
      });
    });
  });

  // Test 5: Logging
  console.log('\nTest 5: Logging within observe()');
  await Ducsigr.observe('operation-with-logs', async () => {
    Ducsigr.log('Starting operation', { step: 1 });
    await sleep(50);
    Ducsigr.log('Operation in progress', { step: 2 });
    await sleep(50);
    Ducsigr.log('Operation complete', { step: 3 });
    return 'done';
  });

  // Test 6: Error handling
  console.log('\nTest 6: Error handling');
  try {
    await Ducsigr.observe('failing-operation', async () => {
      await sleep(30);
      throw new Error('Something went wrong!');
    });
  } catch (err) {
    console.log('Caught error:', (err as Error).message);
  }

  console.log('\n=== All tests completed ===\n');

  // Flush and shutdown
  await Ducsigr.flush();
  await Ducsigr.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
