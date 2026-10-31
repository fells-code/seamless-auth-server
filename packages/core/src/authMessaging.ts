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
  AccountNoticeApplication,
  AccountNoticeName,
  AuthDeliveryInstruction,
  DeliveryPurpose,
  DeliveryResult,
  EmailMessage,
  MessagingChannel,
  SendMagicLinkEmailInput,
  SendOtpEmailInput,
  SendOtpSmsInput,
  SmsMessage,
} from "@seamless-auth/types";

import type {
  AccountNoticeApplication,
  AccountNoticeName,
  DeliveryPurpose,
  DeliveryResult,
  EmailMessage,
  SendMagicLinkEmailInput,
  SendOtpEmailInput,
  SendOtpSmsInput,
  SmsMessage,
} from "@seamless-auth/types";

export interface SendEnrollmentInviteEmailInput {
  to: string;
  signInUrl: string;
  from?: string;
  subject?: string;
}

/**
 * An owner notice the auth API asked this server to send, such as "account recovery
 * was requested". `text` is ready to send. `cancelUrl` carries a credential: send it
 * only to `to`, and never log it. `application` names the registered application an
 * `application_notice` was sent for; the text already says so.
 */
export interface SendAccountNoticeEmailInput {
  notice: AccountNoticeName;
  to: string;
  subject: string;
  text: string;
  cancelUrl?: string;
  application?: AccountNoticeApplication;
  from?: string;
}

export interface SendAccountNoticeSmsInput {
  notice: AccountNoticeName;
  to: string;
  text: string;
  cancelUrl?: string;
  application?: AccountNoticeApplication;
  from?: string;
}

/** Why a code was sent, when it is not an ordinary sign-in or verification code. */
export interface OtpPurpose {
  purpose?: DeliveryPurpose;
}

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
    input: SendOtpEmailInput & OtpPurpose,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
  otpSms?: (
    input: SendOtpSmsInput & OtpPurpose,
    defaults: SmsMessage,
    context: AuthMessageOverrideContext,
  ) => SmsMessage;
  magicLinkEmail?: (
    input: SendMagicLinkEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
  enrollmentInviteEmail?: (
    input: SendEnrollmentInviteEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
  accountNoticeEmail?: (
    input: SendAccountNoticeEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
  accountNoticeSms?: (
    input: SendAccountNoticeSmsInput,
    defaults: SmsMessage,
    context: AuthMessageOverrideContext,
  ) => SmsMessage;
}

export interface AuthMessagingHandlers {
  sendOtpEmail(input: SendOtpEmailInput & OtpPurpose): Promise<DeliveryResult>;
  sendOtpSms(input: SendOtpSmsInput & OtpPurpose): Promise<DeliveryResult>;
  sendMagicLinkEmail(input: SendMagicLinkEmailInput): Promise<DeliveryResult>;
  sendEnrollmentInviteEmail?(
    input: SendEnrollmentInviteEmailInput,
  ): Promise<DeliveryResult>;
  sendAccountNoticeEmail?(
    input: SendAccountNoticeEmailInput,
  ): Promise<DeliveryResult>;
  sendAccountNoticeSms?(input: SendAccountNoticeSmsInput): Promise<DeliveryResult>;
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
