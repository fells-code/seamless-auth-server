import {
  AuthDeliveryInstruction,
  EmailMessage,
  SeamlessAuthMessagingOptions,
  SmsMessage,
} from "../messaging";

function applyEmailOverride<TInput>(
  override:
    | ((input: TInput, defaults: EmailMessage, context: { appName?: string }) => EmailMessage)
    | undefined,
  input: TInput,
  defaults: EmailMessage,
  appName?: string,
): EmailMessage {
  return override ? override(input, defaults, { appName }) : defaults;
}

function applySmsOverride<TInput>(
  override:
    | ((input: TInput, defaults: SmsMessage, context: { appName?: string }) => SmsMessage)
    | undefined,
  input: TInput,
  defaults: SmsMessage,
  appName?: string,
): SmsMessage {
  return override ? override(input, defaults, { appName }) : defaults;
}

function buildOtpEmailMessage(
  input: Extract<AuthDeliveryInstruction, { kind: "otp_email" }>,
  messaging: SeamlessAuthMessagingOptions,
): EmailMessage {
  const appName = messaging.defaults?.appName ?? "Seamless Auth";

  return applyEmailOverride(
    messaging.overrides?.otpEmail,
    {
      to: input.to,
      token: input.token,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Verify your email`,
    },
    {
      to: input.to,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Verify your email`,
      text: `Verify your account with ${appName}.\n\nYour verification code is: ${input.token}\n\nIf you did not request this code, you can safely ignore this message.`,
      html: `<div><h1>Verify your account with ${appName}</h1><p>Please use the verification code below:</p><p><strong>${input.token}</strong></p><p>If you did not request this code, you can safely ignore this message.</p></div>`,
    },
    appName,
  );
}

function buildOtpSmsMessage(
  input: Extract<AuthDeliveryInstruction, { kind: "otp_sms" }>,
  messaging: SeamlessAuthMessagingOptions,
): SmsMessage {
  const appName = messaging.defaults?.appName ?? "Seamless Auth";

  return applySmsOverride(
    messaging.overrides?.otpSms,
    {
      to: input.to,
      token: input.token,
      from: messaging.defaults?.smsFrom,
    },
    {
      to: input.to,
      from: messaging.defaults?.smsFrom,
      body: `Your ${appName} verification code is: ${input.token}. No one will ever ask you for this code. Do not share it.`,
    },
    appName,
  );
}

function buildMagicLinkMessage(
  input: Extract<AuthDeliveryInstruction, { kind: "magic_link_email" }>,
  messaging: SeamlessAuthMessagingOptions,
): EmailMessage {
  const appName = messaging.defaults?.appName ?? "Seamless Auth";

  return applyEmailOverride(
    messaging.overrides?.magicLinkEmail,
    {
      to: input.to,
      magicLinkUrl: input.magicLinkUrl,
      token: input.token,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Your sign-in link`,
    },
    {
      to: input.to,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Your sign-in link`,
      text: `Use the link below to sign in to ${appName}:\n\n${input.magicLinkUrl}\n\nIf you did not request this email, you can safely ignore it.`,
      html: `<div><h1>Sign in to ${appName}</h1><p>Use the link below to complete sign-in:</p><p><a href="${input.magicLinkUrl}">${input.magicLinkUrl}</a></p><p>If you did not request this email, you can safely ignore it.</p></div>`,
    },
    appName,
  );
}

function buildBootstrapInviteMessage(
  input: Extract<AuthDeliveryInstruction, { kind: "bootstrap_invite_email" }>,
  messaging: SeamlessAuthMessagingOptions,
): EmailMessage {
  const appName = messaging.defaults?.appName ?? "Seamless Auth";

  return applyEmailOverride(
    messaging.overrides?.bootstrapInviteEmail,
    {
      to: input.to,
      inviteUrl: input.inviteUrl,
      token: input.token,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Bootstrap invite`,
    },
    {
      to: input.to,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Bootstrap invite`,
      text: `You have been invited to bootstrap ${appName}.\n\nUse the link below to continue:\n${input.inviteUrl}`,
      html: `<div><h1>Bootstrap invite for ${appName}</h1><p>Use the link below to continue:</p><p><a href="${input.inviteUrl}">${input.inviteUrl}</a></p></div>`,
    },
    appName,
  );
}

export async function deliverAuthMessage(
  messaging: SeamlessAuthMessagingOptions | undefined,
  delivery: AuthDeliveryInstruction | undefined,
): Promise<void> {
  if (!messaging || !delivery) {
    return;
  }

  switch (delivery.kind) {
    case "otp_email":
      if (messaging.handlers?.sendOtpEmail) {
        await messaging.handlers.sendOtpEmail({
          to: delivery.to,
          token: delivery.token,
          from: messaging.defaults?.emailFrom,
        });
        return;
      }

      if (!messaging.email) {
        throw new Error("Missing email transport for OTP email delivery.");
      }

      await messaging.email.send(buildOtpEmailMessage(delivery, messaging));
      return;

    case "otp_sms":
      if (messaging.handlers?.sendOtpSms) {
        await messaging.handlers.sendOtpSms({
          to: delivery.to,
          token: delivery.token,
          from: messaging.defaults?.smsFrom,
        });
        return;
      }

      if (!messaging.sms) {
        throw new Error("Missing SMS transport for OTP SMS delivery.");
      }

      await messaging.sms.send(buildOtpSmsMessage(delivery, messaging));
      return;

    case "magic_link_email":
      if (messaging.handlers?.sendMagicLinkEmail) {
        await messaging.handlers.sendMagicLinkEmail({
          to: delivery.to,
          token: delivery.token,
          magicLinkUrl: delivery.magicLinkUrl,
          from: messaging.defaults?.emailFrom,
        });
        return;
      }

      if (!messaging.email) {
        throw new Error("Missing email transport for magic link delivery.");
      }

      await messaging.email.send(buildMagicLinkMessage(delivery, messaging));
      return;

    case "bootstrap_invite_email":
      if (messaging.handlers?.sendBootstrapInviteEmail) {
        await messaging.handlers.sendBootstrapInviteEmail({
          to: delivery.to,
          inviteUrl: delivery.inviteUrl,
          from: messaging.defaults?.emailFrom,
        });
        return;
      }

      if (!messaging.email) {
        throw new Error("Missing email transport for bootstrap invite delivery.");
      }

      await messaging.email.send(buildBootstrapInviteMessage(delivery, messaging));
      return;
  }
}

export function stripDelivery<T extends { delivery?: unknown }>(body: T): Omit<T, "delivery"> {
  const { delivery: _delivery, ...rest } = body;
  return rest;
}
