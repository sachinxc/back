const express = require("express");
const cors = require("cors");
const passport = require("passport");
const path = require("path");
const initializeDatabases = require("./config/index");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const postRoutes = require("./routes/post");
const faceRoutes = require("./routes/faces"); // Import the face routes
const modelRoutes = require("./routes/models"); // Import the models route
const redisClient = require("./utils/redisClient"); // Import the Redis client

const app = express();

require("dotenv").config(); // Load environment variables
require("./config/passport"); // Passport config

const allowedOrigins = [
  "http://trusted.com",
  "http://localhost:3000",
  "https://vocal-douhua-b76663.netlify.app",
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.json());
app.use(passport.initialize());

// Serve static files from the uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/faces", faceRoutes); // Add the face routes
app.use("/models", modelRoutes); // Add the models route

app.get("/", (req, res) => {
  res.send("Hello, the server is running!");
});

const PORT = process.env.PORT || 5000;

// Syncing the database and starting the server
const sequelize = require("./config/database");

initializeDatabases()
  .then(() => {
    sequelize
      .sync({ alter: true })
      .then(() => {
        console.log("Database & tables created!");
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      })
      .catch((err) => console.error("Error syncing database:", err));
  })
  .catch((err) => {
    console.error("Unable to initialize databases:", err);
    process.exit(1);
  });
