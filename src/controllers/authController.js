
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { User, Otp, db } = require("../models");
const { createToken } = require("../services/tokenService");
const { sendOtpSms } = require("../services/smsService");
const { ok, fail } = require("../utils/response");

// ==========================================
// HELPERS
// ==========================================

const cleanMobile = (value) =>
  String(value || "").replace(/\D/g, "");

const validMobile = (mobile) =>
  /^[6-9]\d{9}$/.test(mobile);

const getExpiryMinutes = () =>
  Number(process.env.OTP_EXPIRES_MINUTES || 5);

const getResendSeconds = () =>
  Number(process.env.OTP_RESEND_SECONDS || 60);

const getMaxAttempts = () =>
  Number(process.env.OTP_MAX_ATTEMPTS || 5);

function otpHash(mobile, otp) {
  const secret = process.env.OTP_HASH_SECRET;

  if (
    !secret ||
    secret.length < 32 ||
    secret.startsWith("YOUR_")
  ) {
    throw new Error(
      "OTP_HASH_SECRET must contain a secure random value"
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${mobile}:${otp}`)
    .digest("hex");
}

function sameHash(a, b) {
  const x = Buffer.from(String(a || ""), "hex");
  const y = Buffer.from(String(b || ""), "hex");

  return (
    x.length === 32 &&
    y.length === 32 &&
    crypto.timingSafeEqual(x, y)
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
  };
}

// ==========================================
// PROFILE HELPERS
// ==========================================

function needsProfileSetup(user) {
  const name = String(user?.name || "").trim();

  return (
    !name ||
    name.toLowerCase() === "customer"
  );
}

function validateName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (
    name.length < 2 ||
    name.length > 120
  ) {
    return null;
  }

  return name;
}

// ==========================================
// SEND REAL-TIME 4-DIGIT SMS OTP
// ==========================================

exports.sendOtp = async (req, res, next) => {
  try {
    const mobile = cleanMobile(req.body?.mobile);

    if (!validMobile(mobile)) {
      return fail(
        res,
        "Valid 10-digit Indian mobile number required",
        400
      );
    }

    const waitSeconds = getResendSeconds();

    const existing = await Otp.findOne({
      where: { mobile },
      order: [["createdAt", "DESC"]],
    });

    if (existing) {
      const elapsed =
        Date.now() -
        new Date(existing.createdAt).getTime();

      const remaining = Math.ceil(
        (waitSeconds * 1000 - elapsed) / 1000
      );

      if (remaining > 0) {
        return fail(
          res,
          `Please wait ${remaining} seconds before requesting another OTP`,
          429
        );
      }
    }

    // Generate random four-digit OTP.
    const otp = crypto
      .randomInt(0, 10000)
      .toString()
      .padStart(4, "0");

    const expiresAt = new Date(
      Date.now() + getExpiryMinutes() * 60000
    );

    const hashedOtp = otpHash(mobile, otp);

    // Store OTP before sending SMS.
    const record = await db.transaction(
      async (transaction) => {
        await Otp.destroy({
          where: { mobile },
          transaction,
        });

        return Otp.create(
          {
            mobile,
            otp: hashedOtp,
            expiresAt,
            attempts: 0,
            isVerified: false,
          },
          {
            transaction,
          }
        );
      }
    );

    try {
      await sendOtpSms(mobile, otp);
    } catch (error) {
      console.error(
        "SMS sending failed:",
        error.message
      );

      // Remove only the failed OTP record.
      await Otp.destroy({
        where: {
          id: record.id,
          mobile,
          otp: hashedOtp,
          isVerified: false,
        },
      });

      return fail(
        res,
        "SMS could not be sent. Please try later",
        503
      );
    }

    return ok(
      res,
      {
        mobile,
        expiresIn: getExpiryMinutes() * 60,
        resendAfter: waitSeconds,
      },
      "OTP sent"
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// VERIFY 4-DIGIT OTP
// ==========================================

exports.verifyOtp = async (req, res, next) => {
  try {
    const mobile = cleanMobile(req.body?.mobile);
    const otp = String(req.body?.otp || "");

    if (
      !validMobile(mobile) ||
      !/^\d{4}$/.test(otp)
    ) {
      return fail(
        res,
        "Valid mobile and 4-digit OTP required",
        400
      );
    }

    const result = await db.transaction(
      async (transaction) => {
        const record = await Otp.findOne({
          where: {
            mobile,
            isVerified: false,
          },
          order: [["createdAt", "DESC"]],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (
          !record ||
          new Date(record.expiresAt).getTime() <=
            Date.now()
        ) {
          return {
            error: "Invalid or expired OTP",
            code: 400,
          };
        }

        if (
          record.attempts >= getMaxAttempts()
        ) {
          return {
            error:
              "Too many attempts. Request a new OTP",
            code: 429,
          };
        }

        const expectedHash = otpHash(mobile, otp);

        if (
          !sameHash(record.otp, expectedHash)
        ) {
          await record.increment("attempts", {
            transaction,
          });

          return {
            error: "Invalid OTP",
            code: 400,
          };
        }

        let user = await User.findOne({
          where: { mobile },
          transaction,
        });

        if (user && !user.isActive) {
          return {
            error: "Account is inactive",
            code: 403,
          };
        }

        if (!user) {
          user = await User.create(
            {
              mobile,
              name: "Customer",
            },
            {
              transaction,
            }
          );
        }

        await record.update(
          {
            isVerified: true,
          },
          {
            transaction,
          }
        );

        return { user };
      }
    );

    if (result.error) {
      return fail(
        res,
        result.error,
        result.code
      );
    }

    const user = result.user;

    return ok(
      res,
      {
        token: createToken(user),
        user: publicUser(user),
        needsProfileSetup:
          needsProfileSetup(user),
      },
      "Login successful"
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// COMPLETE PROFILE AFTER OTP
// ==========================================

exports.completeProfile = async (
  req,
  res,
  next
) => {
  try {
    const name = validateName(
      req.body?.name
    );

    if (!name) {
      return fail(
        res,
        "Name must contain between 2 and 120 characters",
        400
      );
    }

    const user = await User.findByPk(
      req.user.id
    );

    if (!user) {
      return fail(
        res,
        "User not found",
        404
      );
    }

    if (!user.isActive) {
      return fail(
        res,
        "Account is inactive",
        403
      );
    }

    if (user.role !== "user") {
      return fail(
        res,
        "Only customers can complete this profile",
        403
      );
    }

    await user.update({ name });

    return ok(
      res,
      {
        user: publicUser(user),
        needsProfileSetup: false,
      },
      "Profile completed successfully"
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// UPDATE CUSTOMER PROFILE
// ==========================================

exports.updateProfile = async (
  req,
  res,
  next
) => {
  try {
    const name = validateName(
      req.body?.name
    );

    if (!name) {
      return fail(
        res,
        "Name must contain between 2 and 120 characters",
        400
      );
    }

    const user = await User.findByPk(
      req.user.id
    );

    if (!user) {
      return fail(
        res,
        "User not found",
        404
      );
    }

    if (!user.isActive) {
      return fail(
        res,
        "Account is inactive",
        403
      );
    }

    if (user.role !== "user") {
      return fail(
        res,
        "Only customers can update their profile",
        403
      );
    }

    await user.update({ name });

    return ok(
      res,
      {
        user: publicUser(user),
        needsProfileSetup:
          needsProfileSetup(user),
      },
      "Profile updated successfully"
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// ADMIN LOGIN - EXISTING FUNCTIONALITY
// ==========================================

exports.adminLogin = async (
  req,
  res,
  next
) => {
  try {
    const email = String(
      req.body?.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body?.password || ""
    );

    if (!email || !password) {
      return fail(
        res,
        "Email and password are required",
        400
      );
    }

    const user = await User.findOne({
      where: {
        email,
        role: "admin",
      },
    });

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(
        password,
        user.password
      ))
    ) {
      return fail(
        res,
        "Invalid email or password",
        401
      );
    }

    if (!user.isActive) {
      return fail(
        res,
        "Admin account is inactive",
        403
      );
    }

    return ok(
      res,
      {
        token: createToken(user),
        user: publicUser(user),
      },
      "Admin login successful"
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET CURRENT USER - EXISTING FUNCTIONALITY
// ==========================================

exports.me = (req, res) => {
  return ok(
    res,
    publicUser(req.user)
  );
};

// ==========================================
// ADMIN CHANGE PASSWORD - NEW
// ==========================================

exports.adminChangePassword = async (
  req,
  res,
  next
) => {
  try {
    // Authentication and adminOnly middleware
    // must protect this endpoint.
    const adminId = req.user?.id;

    if (!adminId) {
      return fail(
        res,
        "Authentication required",
        401
      );
    }

    const currentPassword =
      req.body?.currentPassword;

    const newPassword =
      req.body?.newPassword;

    // Validate request fields.
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return fail(
        res,
        "Current password and new password are required",
        400
      );
    }

    if (
      newPassword.length < 8 ||
      newPassword.length > 72
    ) {
      return fail(
        res,
        "New password must contain between 8 and 72 characters",
        400
      );
    }

    if (
      currentPassword === newPassword
    ) {
      return fail(
        res,
        "New password must be different from current password",
        400
      );
    }

    // Always load the admin from the database.
    const admin = await User.findOne({
      where: {
        id: adminId,
        role: "admin",
      },
    });

    if (!admin) {
      return fail(
        res,
        "Administrator account not found",
        404
      );
    }

    if (!admin.isActive) {
      return fail(
        res,
        "Administrator account is inactive",
        403
      );
    }

    if (!admin.password) {
      return fail(
        res,
        "Administrator password is not configured",
        400
      );
    }

    // Verify current password.
    const isCurrentPasswordValid =
      await bcrypt.compare(
        currentPassword,
        admin.password
      );

    if (!isCurrentPasswordValid) {
      return fail(
        res,
        "Current password is incorrect",
        400
      );
    }

    // Prevent reuse of the existing password.
    const isSamePassword =
      await bcrypt.compare(
        newPassword,
        admin.password
      );

    if (isSamePassword) {
      return fail(
        res,
        "New password must be different from current password",
        400
      );
    }

    // Hash the new password.
    const hashedPassword =
      await bcrypt.hash(
        newPassword,
        12
      );

    // Save new password in MySQL.
    await admin.update({
      password: hashedPassword,
    });

    // Never return passwords or hashes.
    return ok(
      res,
      {
        passwordChanged: true,
      },
      "Admin password changed successfully"
    );
  } catch (error) {
    next(error);
  }
};
