/**
 * Example demonstrating the wrapOpenAI() integration
 *
 * Run with: npx tsx examples/openai-integration.ts
 *
 * Note: This example uses a mock client. For real usage:
 * import OpenAI from 'openai';
 * const openai = wrapOpenAI(new OpenAI());
 */
import { Ducsigr } from '../src/index';
import { wrapOpenAI } from '../src/integrations';

// Initialize the SDK
Ducsigr.init({
  apiKey: 'co_test_key',
  endpoint: 'http://localhost:8080',
  debug: true,
});

// Mock OpenAI client for testing
function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          // Simulate API latency
          await sleep(100);

          if (params.stream) {
            // Return async generator for streaming
            return mockStreamingResponse();
          }

          // Return non-streaming response
          return {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            model: params.model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: `Mock response to: ${params.messages[params.messages.length - 1]?.content}`,
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 25,
              total_tokens: 40,
            },
          };
        },
      },
    },
    embeddings: {
      create: async (params: any) => {
        await sleep(50);
        return {
          object: 'list',
          model: params.model,
          data: [
            {
              index: 0,
              embedding: new Array(1536).fill(0).map(() => Math.random()),
            },
          ],
          usage: {
            prompt_tokens: 5,
            total_tokens: 5,
          },
        };
      },
    },
  };
}

async function* mockStreamingResponse() {
  const content = 'Hello! I am a mock streaming response.';
  const words = content.split(' ');

  for (let i = 0; i < words.length; i++) {
    await sleep(50);
    yield {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: {
            content: (i === 0 ? '' : ' ') + words[i],
          },
          finish_reason: null,
        },
      ],
    };
  }

  // Final chunk with finish_reason
  yield {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: {},
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

async function main() {
  console.log('\n=== Testing wrapOpenAI() ===\n');

  // Wrap the mock client
  const openai = wrapOpenAI(createMockOpenAI(), {
    createTrace: true, // Auto-create traces for each call
  });

  // Test 1: Non-streaming chat completion
  console.log('Test 1: Non-streaming chat completion');
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 2 + 2?' },
    ],
    temperature: 0.7,
  });
  console.log('Response:', response.choices[0].message.content);
  console.log('Usage:', response.usage);

  // Test 2: Streaming chat completion
  console.log('\nTest 2: Streaming chat completion');
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
    stream: true,
  });

  process.stdout.write('Streaming: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n');

  // Test 3: Embeddings
  console.log('Test 3: Embeddings');
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'Hello, world!',
  });
  console.log('Embedding dimensions:', embedding.data[0].embedding.length);
  console.log('Usage:', embedding.usage);

  // Test 4: Within an observe() context
  console.log('\nTest 4: Within observe() context');
  await Ducsigr.observe('multi-step-operation', async () => {
    console.log('  Step 1: Preparing data');
    await sleep(50);

    console.log('  Step 2: Calling OpenAI');
    const result = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Summarize this document' }],
    });

    console.log('  Step 3: Processing result');
    return { summary: result.choices[0].message.content };
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
