const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.POSTGRES_DB,
  process.env.POSTGRES_USER,
  process.env.POSTGRES_PASSWORD,
  {
    host: process.env.POSTGRES_HOST,
    dialect: "postgres",
    logging: false, // Disables logging for production
  }
);

module.exports = sequelize;
