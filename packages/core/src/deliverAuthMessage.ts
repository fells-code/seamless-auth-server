import type {
  AuthDeliveryInstruction,
  EmailMessage,
  SeamlessAuthMessagingOptions,
  SmsMessage,
} from "./authMessaging.js";
import { getSeamlessLogger } from "./logger.js";

function applyEmailOverride<TInput>(
  override:
    | ((
        input: TInput,
        defaults: EmailMessage,
        context: { appName?: string },
      ) => EmailMessage)
    | undefined,
  input: TInput,
  defaults: EmailMessage,
  appName?: string,
): EmailMessage {
  return override ? override(input, defaults, { appName }) : defaults;
}

function applySmsOverride<TInput>(
  override:
    | ((
        input: TInput,
        defaults: SmsMessage,
        context: { appName?: string },
      ) => SmsMessage)
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

function buildEnrollmentInviteMessage(
  input: Extract<AuthDeliveryInstruction, { kind: "enrollment_invite_email" }>,
  messaging: SeamlessAuthMessagingOptions,
): EmailMessage {
  const appName = messaging.defaults?.appName ?? "Seamless Auth";

  return applyEmailOverride(
    messaging.overrides?.enrollmentInviteEmail,
    {
      to: input.to,
      signInUrl: input.signInUrl,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Set up a passkey`,
    },
    {
      to: input.to,
      from: messaging.defaults?.emailFrom,
      subject: `${appName} - Set up a passkey`,
      text: `You have been invited to set up a passkey for ${appName}. Sign in at the link below and follow the prompt:\n\n${input.signInUrl}\n\nIf you were not expecting this email, you can safely ignore it.`,
      html: `<div><h1>Set up a passkey for ${appName}</h1><p>Sign in at the link below and follow the prompt to add a passkey:</p><p><a href="${input.signInUrl}">${input.signInUrl}</a></p><p>If you were not expecting this email, you can safely ignore it.</p></div>`,
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

    case "enrollment_invite_email":
      if (messaging.handlers?.sendEnrollmentInviteEmail) {
        await messaging.handlers.sendEnrollmentInviteEmail({
          to: delivery.to,
          signInUrl: delivery.signInUrl,
          from: messaging.defaults?.emailFrom,
        });
        return;
      }

      if (!messaging.email) {
        throw new Error(
          "Missing email transport for enrollment invite delivery.",
        );
      }

      await messaging.email.send(
        buildEnrollmentInviteMessage(delivery, messaging),
      );
      return;

    default: {
      // A new kind in @seamless-auth/types fails the build here. At runtime an
      // API newer than this adapter can still send one, so it is logged, not thrown.
      const unhandled: never = delivery;
      getSeamlessLogger().warn(
        `[SeamlessAuth] Unsupported delivery kind "${(unhandled as { kind: string }).kind}", so no message was sent.`,
      );
    }
  }
}

export function stripDelivery<T extends { delivery?: unknown }>(
  body: T,
): Omit<T, "delivery"> {
  const { delivery: _delivery, ...rest } = body;
  return rest;
}

/**
 * Applies external delivery to an upstream response body and returns the body to send on.
 *
 * When messaging is configured the adapter asks the auth API for a delivery payload instead of
 * having the API send the message itself. A missing payload means nobody sent anything, so it is
 * surfaced here: the four endpoints that route through this helper always include `delivery` when
 * the API accepts the request as externally delivered.
 */
export async function applyExternalDelivery(
  messaging: SeamlessAuthMessagingOptions | undefined,
  body: unknown,
): Promise<unknown> {
  if (body && typeof body === "object" && "delivery" in body) {
    await deliverAuthMessage(
      messaging,
      (body as { delivery?: AuthDeliveryInstruction }).delivery,
    );
    return stripDelivery(body as { delivery?: unknown });
  }

  if (messaging) {
    getSeamlessLogger().warn(
      "[SeamlessAuth] External delivery was requested but the auth API returned no delivery payload, so no message was sent. Verify that serviceSecret matches the auth API's API_SERVICE_TOKEN.",
    );
  }

  return body;
}
