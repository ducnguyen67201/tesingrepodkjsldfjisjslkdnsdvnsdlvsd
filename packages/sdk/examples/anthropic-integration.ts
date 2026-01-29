/**
 * Example demonstrating the wrapAnthropic() integration
 *
 * Run with: npx tsx examples/anthropic-integration.ts
 *
 * Note: This example uses a mock client. For real usage:
 * import Anthropic from '@anthropic-ai/sdk';
 * const anthropic = wrapAnthropic(new Anthropic());
 */
import { Ducsigr } from '../src/index';
import { wrapAnthropic } from '../src/integrations';

// Initialize the SDK
Ducsigr.init({
  apiKey: 'co_test_key',
  endpoint: 'http://localhost:8080',
  debug: true,
});

// Mock Anthropic client for testing
function createMockAnthropic() {
  return {
    messages: {
      create: async (params: any) => {
        // Simulate API latency
        await sleep(100);

        if (params.stream) {
          // Return async generator for streaming
          return mockStreamingResponse();
        }

        // Return non-streaming response
        return {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: params.model,
          content: [
            {
              type: 'text',
              text: `Mock response to: ${params.messages[params.messages.length - 1]?.content}`,
            },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 20,
            output_tokens: 30,
          },
        };
      },
    },
  };
}

async function* mockStreamingResponse() {
  const content = 'Hello! I am Claude, a mock streaming response.';
  const words = content.split(' ');

  // message_start event
  yield {
    type: 'message_start',
    message: {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-sonnet-20241022',
      content: [],
      stop_reason: null,
      usage: {
        input_tokens: 15,
        output_tokens: 0,
      },
    },
  };

  // content_block_start
  yield {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'text',
      text: '',
    },
  };

  // Stream content
  for (let i = 0; i < words.length; i++) {
    await sleep(50);
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: (i === 0 ? '' : ' ') + words[i],
      },
    };
  }

  // content_block_stop
  yield {
    type: 'content_block_stop',
    index: 0,
  };

  // message_delta with final usage
  yield {
    type: 'message_delta',
    delta: {
      stop_reason: 'end_turn',
      stop_sequence: null,
    },
    usage: {
      output_tokens: 12,
    },
  };

  // message_stop
  yield {
    type: 'message_stop',
  };
}

async function main() {
  console.log('\n=== Testing wrapAnthropic() ===\n');

  // Wrap the mock client
  const anthropic = wrapAnthropic(createMockAnthropic(), {
    createTrace: true, // Auto-create traces for each call
  });

  // Test 1: Non-streaming message
  console.log('Test 1: Non-streaming message');
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  });
  console.log(
    'Response:',
    response.content[0].type === 'text' ? response.content[0].text : ''
  );
  console.log('Usage:', response.usage);

  // Test 2: Streaming message
  console.log('\nTest 2: Streaming message');
  const stream = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
    stream: true,
  });

  process.stdout.write('Streaming: ');
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta'
    ) {
      process.stdout.write(event.delta.text);
    }
  }
  console.log('\n');

  // Test 3: With system prompt
  console.log('Test 3: With system prompt');
  const systemResponse = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: 'You are a helpful coding assistant.',
    messages: [{ role: 'user', content: 'Write a hello world in Python.' }],
  });
  console.log(
    'Response:',
    systemResponse.content[0].type === 'text'
      ? systemResponse.content[0].text
      : ''
  );

  // Test 4: Within an observe() context
  console.log('\nTest 4: Within observe() context');
  await Ducsigr.observe('analysis-pipeline', async () => {
    console.log('  Step 1: Loading document');
    await sleep(50);

    console.log('  Step 2: Calling Claude for analysis');
    const result = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'Analyze this document...' }],
    });

    console.log('  Step 3: Processing analysis');
    return {
      analysis:
        result.content[0].type === 'text' ? result.content[0].text : '',
    };
  });

  console.log('\n=== All tests completed ===\n');

  // Flush and shutdown
  await Ducsigr.flush();
  await Ducsigr.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
