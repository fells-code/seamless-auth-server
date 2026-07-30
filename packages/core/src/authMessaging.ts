/**
 * The messaging contract.
 *
 * The wire shapes belong to `@seamless-auth/types`, so they are re-exported rather
 * than declared again: the auth API sends the delivery instruction and this
 * package consumes it, and two definitions of that could drift. The re-export is
 * type-only, so it is erased at compile time and neither zod nor the schema
 * barrel enters the runtime module graph.
 *
 * What stays here is what is genuinely this package's: the transport interfaces,
 * which carry provider implementations, and the adopter-facing configuration.
 */
export type {
  AuthDeliveryInstruction,
  DeliveryResult,
  EmailMessage,
  MessagingChannel,
  SendMagicLinkEmailInput,
  SendOtpEmailInput,
  SendOtpSmsInput,
  SmsMessage,
} from "@seamless-auth/types";

import type {
  DeliveryResult,
  EmailMessage,
  SendMagicLinkEmailInput,
  SendOtpEmailInput,
  SendOtpSmsInput,
  SmsMessage,
} from "@seamless-auth/types";

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<DeliveryResult>;
}

export interface SmsTransport {
  readonly name: string;
  send(message: SmsMessage): Promise<DeliveryResult>;
}

export interface AuthMessageOverrideContext {
  appName?: string;
}

export interface AuthMessageOverrides {
  otpEmail?: (
    input: SendOtpEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
  otpSms?: (
    input: SendOtpSmsInput,
    defaults: SmsMessage,
    context: AuthMessageOverrideContext,
  ) => SmsMessage;
  magicLinkEmail?: (
    input: SendMagicLinkEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
}

export interface AuthMessagingHandlers {
  sendOtpEmail(input: SendOtpEmailInput): Promise<DeliveryResult>;
  sendOtpSms(input: SendOtpSmsInput): Promise<DeliveryResult>;
  sendMagicLinkEmail(input: SendMagicLinkEmailInput): Promise<DeliveryResult>;
}

export interface SeamlessAuthMessagingOptions {
  email?: EmailTransport;
  sms?: SmsTransport;
  handlers?: Partial<AuthMessagingHandlers>;
  overrides?: AuthMessageOverrides;
  defaults?: {
    appName?: string;
    emailFrom?: string;
    smsFrom?: string;
  };
}
