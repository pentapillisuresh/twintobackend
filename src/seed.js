
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const bcrypt = require("bcryptjs");

const {
  db,
  User,
  Setting,
} = require("./models");

const {
  DEFAULT_FEES,
} = require("./services/feeService");

// ==========================================
// TWINTO ADMIN SEED
// ==========================================

(async () => {
  try {
    // ======================================
    // VALIDATE JWT SECRET
    // ======================================

    if (
      !process.env.JWT_SECRET ||
      process.env.JWT_SECRET.length < 24
    ) {
      throw new Error(
        "Set JWT_SECRET to at least 24 characters in backend/.env"
      );
    }

    // ======================================
    // DATABASE CONNECTION
    // ======================================

    await db.authenticate();

    await db.sync();

    console.log("Database connected successfully.");

    // ======================================
    // ADMIN DETAILS
    // ======================================

    const email = String(
      process.env.ADMIN_EMAIL || "admin@twinto.com"
    )
      .trim()
      .toLowerCase();

    const name =
      process.env.ADMIN_NAME || "TWINTO Admin";

    const mobile = String(
      process.env.ADMIN_MOBILE || "9999999999"
    );

    // ======================================
    // CHECK EXISTING ADMIN
    // ======================================

    let admin = await User.findOne({
      where: {
        email,
      },
    });

    if (!admin) {
      // ====================================
      // CREATE ADMIN ONLY ONCE
      // ====================================

      const password = String(
        process.env.ADMIN_PASSWORD || ""
      );

      if (password.length < 10) {
        throw new Error(
          "Set ADMIN_PASSWORD to at least 10 characters in backend/.env"
        );
      }

      const hashedPassword =
        await bcrypt.hash(password, 12);

      admin = await User.create({
        name,
        email,
        mobile,
        password: hashedPassword,
        role: "admin",
        isActive: true,
      });

      console.log(
        `New admin account created: ${email}`
      );
    } else {
      // ====================================
      // EXISTING ADMIN - DO NOT RESET
      // ====================================

      if (admin.role !== "admin") {
        throw new Error(
          "An account with this email already exists and is not an admin"
        );
      }

      console.log(
        `Admin already exists: ${email}`
      );

      console.log(
        "Existing admin password preserved."
      );

      // Do not update:
      // - password
      // - role
      // - isActive
      //
      // This ensures Change Password
      // works permanently.
    }

    // ======================================
    // DEFAULT FEE SETTINGS
    // ======================================

    const feeSettings = DEFAULT_FEES ?? {};

    await Setting.findOrCreate({
      where: {
        key: "feeSettings",
      },
      defaults: {
        key: "feeSettings",
        value: feeSettings,
      },
    });

    console.log(
      "Default fee settings verified."
    );

    // ======================================
    // SUCCESS
    // ======================================

    console.log(
      "TWINTO admin seed completed successfully."
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "Seed failed:",
      error.message
    );

    process.exit(1);
  }
})();
