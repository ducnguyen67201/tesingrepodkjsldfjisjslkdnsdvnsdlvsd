/**
 * AlertingAdapter Interface
 *
 * Interface for notification provider adapters.
 * Implement this to add new notification channels.
 */

import type { ChannelProvider, AlertPayload, SendResult } from "../../schemas/alerting";

/**
 * AlertingAdapter interface - implement this for each provider
 *
 * @example
 * ```ts
 * class MyAdapter extends BaseAlertingAdapter {
 *   readonly provider = "MY_PROVIDER" as const;
 *
 *   async send(config: unknown, payload: AlertPayload): Promise<SendResult> {
 *     // Implementation
 *   }
 *
 *   validateConfig(config: unknown): MyConfig {
 *     return MyConfigSchema.parse(config);
 *   }
 * }
 * ```
 */
export interface IAlertingAdapter {
  /**
   * Provider identifier
   */
  readonly provider: ChannelProvider;

  /**
   * Send an alert notification
   * @param config - Provider-specific configuration (from AlertChannel.config)
   * @param payload - Alert data to send
   */
  send(config: unknown, payload: AlertPayload): Promise<SendResult>;

  /**
   * Validate provider-specific configuration
   * @param config - Configuration to validate
   * @returns Validated config or throws ZodError
   */
  validateConfig(config: unknown): unknown;

  /**
   * Send a test notification to verify configuration
   * @param config - Provider-specific configuration
   */
  sendTest(config: unknown): Promise<SendResult>;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseAlertingAdapter implements IAlertingAdapter {
  abstract readonly provider: ChannelProvider;

  abstract send(config: unknown, payload: AlertPayload): Promise<SendResult>;
  abstract validateConfig(config: unknown): unknown;

  /**
   * Send a test notification with sample data
   */
  async sendTest(config: unknown): Promise<SendResult> {
    const testPayload: AlertPayload = {
      alertId: "test-alert-id",
      alertName: "Test Alert",
      projectId: "test-project-id",
      projectName: "Test Project",
      type: "ERROR_RATE",
      threshold: 5.0,
      actualValue: 7.5,
      operator: "GREATER_THAN",
      triggeredAt: new Date().toISOString(),
    };

    return this.send(config, testPayload);
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(messageId?: string): SendResult {
    return {
      success: true,
      provider: this.provider,
      messageId,
    };
  }

  /**
   * Create an error result
   */
  protected createErrorResult(error: string): SendResult {
    return {
      success: false,
      provider: this.provider,
      error,
    };
  }
}
