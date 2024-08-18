require("dotenv-safe").config();
const sequelize = require("./database");

const initializeDatabases = async () => {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL connected");
  } catch (err) {
    console.error("Unable to connect to the database:", err);
  }
};

module.exports = initializeDatabases;
