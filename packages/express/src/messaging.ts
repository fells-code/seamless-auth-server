export type MessagingChannel = "email" | "sms";

export interface DeliveryResult {
  accepted: boolean;
  provider: string;
  channel: MessagingChannel;
  messageId?: string;
  raw?: unknown;
}

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmsMessage {
  to: string;
  from?: string;
  body: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<DeliveryResult>;
}

export interface SmsTransport {
  readonly name: string;
  send(message: SmsMessage): Promise<DeliveryResult>;
}

export interface SendOtpEmailInput {
  to: string;
  token: string;
  from?: string;
  subject?: string;
}

export interface SendOtpSmsInput {
  to: string;
  token: string | number;
  from?: string;
}

export interface SendMagicLinkEmailInput {
  to: string;
  magicLinkUrl: string;
  token?: string;
  from?: string;
  subject?: string;
}

export interface SendBootstrapInviteEmailInput {
  to: string;
  inviteUrl: string;
  from?: string;
  subject?: string;
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
  bootstrapInviteEmail?: (
    input: SendBootstrapInviteEmailInput,
    defaults: EmailMessage,
    context: AuthMessageOverrideContext,
  ) => EmailMessage;
}

export interface AuthMessagingHandlers {
  sendOtpEmail(input: SendOtpEmailInput): Promise<DeliveryResult>;
  sendOtpSms(input: SendOtpSmsInput): Promise<DeliveryResult>;
  sendMagicLinkEmail(
    input: SendMagicLinkEmailInput,
  ): Promise<DeliveryResult>;
  sendBootstrapInviteEmail(
    input: SendBootstrapInviteEmailInput,
  ): Promise<DeliveryResult>;
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

export type AuthDeliveryInstruction =
  | {
      kind: "otp_email";
      to: string;
      token: string;
    }
  | {
      kind: "otp_sms";
      to: string;
      token: string | number;
    }
  | {
      kind: "magic_link_email";
      to: string;
      token?: string;
      magicLinkUrl: string;
    }
  | {
      kind: "bootstrap_invite_email";
      to: string;
      token?: string;
      inviteUrl: string;
    };
