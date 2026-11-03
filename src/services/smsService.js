
const sendOtpSms = async (mobile, otp) => {
  const apiUrl = process.env.SMS_API_URL;
  const username = process.env.SMS_API_USER;
  const password = process.env.SMS_API_PASS;

  if (!apiUrl || !username || !password) {
    throw new Error("SMS configuration missing");
  }

  const url = new URL(apiUrl);

  // Use the exact HTTP endpoint supplied by the SMS provider.
  if (url.protocol !== "http:") {
    throw new Error(
      "SMS_API_URL must match the provider's HTTP endpoint"
    );
  }

  const expiry = process.env.OTP_EXPIRES_MINUTES || 5;

  const message =
    `Welcome to TWINTO E COMMERCE! Your login OTP is ${otp}. ` +
    `It is valid for ${expiry} minutes. ` +
    "Do not share this OTP with anyone. " +
    "Visit https://www.twinto.store/";

  url.searchParams.set("user", username);
  url.searchParams.set("pass", password);
  url.searchParams.set("sender", process.env.SMS_SENDER_ID || "TWNTOO");
  url.searchParams.set("phone", String(mobile));
  url.searchParams.set("text", message);
  url.searchParams.set("priority", process.env.SMS_PRIORITY || "ndnd");
  url.searchParams.set("stype", process.env.SMS_STYPE || "normal");

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    console.log("[SMS] Sending OTP", {
      host: url.hostname,
      protocol: url.protocol,
      mobile: `******${String(mobile).slice(-4)}`,
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    const responseText = (await response.text()).trim();

    console.log("[SMS] Provider response:", {
      status: response.status,
      response: responseText.slice(0, 150),
    });

    if (!response.ok) {
      throw new Error(`SMS provider HTTP ${response.status}`);
    }

    const successPattern = new RegExp(
      process.env.SMS_SUCCESS_PATTERN || "^S\\.[0-9]+$",
      "i"
    );

    if (!successPattern.test(responseText)) {
      throw new Error(
        `SMS provider rejected or returned unexpected response: ${responseText.slice(0, 100)}`
      );
    }

    console.log("[SMS] OTP successfully accepted by provider");

    return {
      success: true,
      message: "OTP sent successfully",
    };

  } catch (error) {
    console.error("[SMS] Delivery failed:", {
      message: error.message,
      causeCode: error.cause?.code || null,
    });

    throw error;

  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { sendOtpSms };
