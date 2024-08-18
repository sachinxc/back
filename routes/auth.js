const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/user");
const redisClient = require("../utils/redisClient");
const auth = require("../middleware/auth"); // Import the auth middleware

const JWT_EXPIRY = "1h"; // Token expiry time

router.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Invalid email format"),
    body("password").isLength({ min: 6 }).withMessage("Password too short"),
    // validations
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      accountType,
      firstName,
      lastName,
      organizationName,
      username,
      email,
      dob,
      gender,
      country,
      password,
      confirmPassword,
      phoneNumber,
    } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).send("Passwords do not match");
    }

    try {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).send("Email already in use");
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        accountType,
        firstName,
        lastName,
        organizationName:
          accountType === "organization" ? organizationName : null,
        username,
        email,
        dob,
        gender,
        country,
        password: hashedPassword,
        phoneNumber,
      });

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: JWT_EXPIRY,
      });
      res.json({ token, message: "Signup successful" });
      console.log("Signup successful");
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).send("Error signing up: " + err.message);
    }
  }
);

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).send("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid credentials");

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });
    res.json({ token, user: { id: user.id, username: user.username } });
    console.log("Logged in successfully");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Error logging in: " + err.message);
  }
});

router.post("/logout", auth, async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    await redisClient.set(token, "true", "EX", 3600); // Blacklist token for 1 hour
    res.send("Logged out successfully");
    console.log("Logged out successfully");
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).send("Error logging out");
  }
});

// routes/auth.js
router.get("/current", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        "id",
        "username",
        "firstName",
        "lastName",
        "email",
        "bio",
        "profilePic",
      ],
    });
    res.json(user);
  } catch (err) {
    console.error("Error fetching current user:", err);
    res.status(500).send("Error fetching current user");
  }
});

module.exports = router;
