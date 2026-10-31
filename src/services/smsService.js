
const SMS_TIMEOUT_MS = 10000;

function getSmsConfig() {
  const {
    SMS_API_URL,
    SMS_API_USER,
    SMS_API_PASS,
    SMS_SENDER_ID,
    SMS_SUCCESS_PATTERN,
    SMS_PRIORITY,
    SMS_STYPE,
    SMS_DLT_TEMPLATE_ID,
    SMS_DLT_ENTITY_ID,
  } = process.env;

  if (!SMS_API_URL || !SMS_API_USER || !SMS_API_PASS) {
    throw new Error("SMS gateway not configured");
  }

  if (
    SMS_API_PASS.startsWith("YOUR_") ||
    SMS_API_PASS.startsWith("PASTE_")
  ) {
    throw new Error(
      "SMS gateway password is still a placeholder"
    );
  }

  const url = new URL(SMS_API_URL);

  if (url.protocol !== "https:") {
    throw new Error(
      "SMS gateway must use an HTTPS endpoint"
    );
  }

  let successRegex;

  try {
    successRegex = new RegExp(
      SMS_SUCCESS_PATTERN || "^S\\.[0-9]+$",
      "i"
    );
  } catch {
    throw new Error("Invalid SMS_SUCCESS_PATTERN");
  }

  return {
    url,
    username: SMS_API_USER,
    password: SMS_API_PASS,
    sender: SMS_SENDER_ID || "TWNTOO",
    priority: SMS_PRIORITY || "ndnd",
    stype: SMS_STYPE || "normal",
    templateId: SMS_DLT_TEMPLATE_ID,
    entityId: SMS_DLT_ENTITY_ID,
    successRegex,
  };
}

function maskMobile(mobile) {
  const value = String(mobile || "");

  return value.length >= 4
    ? `******${value.slice(-4)}`
    : "******";
}

async function sendOtpSms(mobile, otp) {
  const config = getSmsConfig();

  const url = new URL(config.url.toString());

  url.searchParams.set("user", config.username);
  url.searchParams.set("pass", config.password);
  url.searchParams.set("sender", config.sender);
  url.searchParams.set("phone", mobile);

  const expiryMinutes = Number(
    process.env.OTP_EXPIRES_MINUTES || 5
  );

  // This message must match the provider's
  // approved DLT template exactly.
  const message =
    "Welcome to TWINTO E COMMERCE! " +
    `Your login OTP is ${otp}. ` +
    `It is valid for ${expiryMinutes} minutes. ` +
    "Do not share this OTP with anyone. " +
    "Visit https://www.twinto.store/";

  url.searchParams.set("text", message);
  url.searchParams.set("priority", config.priority);
  url.searchParams.set("stype", config.stype);

  // Parameter names vary between SMS providers.
  // Enable only after confirming your gateway's API.
  if (config.templateId) {
    url.searchParams.set(
      "templateid",
      config.templateId
    );
  }

  if (config.entityId) {
    url.searchParams.set(
      "entityid",
      config.entityId
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    SMS_TIMEOUT_MS
  );

  try {
    console.log("[SMS] Sending OTP request", {
      mobile: maskMobile(mobile),
      gatewayHost: config.url.hostname,
      sender: config.sender,
      templateConfigured: Boolean(config.templateId),
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: {
        Accept: "text/plain, application/json",
      },
    });

    const responseText = (
      await response.text()
    ).trim();

    // Avoid printing the raw provider response:
    // it may contain phone numbers or other secrets.
    console.log("[SMS] Provider result", {
      httpStatus: response.status,
      responseLength: responseText.length,
      acceptedFormat:
        config.successRegex.test(responseText),
    });

    if (!response.ok) {
      throw new Error(
        `SMS provider HTTP error: ${response.status}`
      );
    }

    if (!responseText) {
      throw new Error(
        "SMS provider returned an empty response"
      );
    }

    if (!config.successRegex.test(responseText)) {
      throw new Error(
        "SMS provider response does not match configured success pattern"
      );
    }

    console.log("[SMS] Provider accepted OTP request");

    return {
      accepted: true,
    };
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "SMS gateway request timed out"
        : error.message;

    console.error("[SMS] Delivery failed:", message);

    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendOtpSms,
};
