const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Face = sequelize.define(
  "Face",
  {
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    descriptor: {
      type: DataTypes.TEXT, // Store the face descriptor as a JSON string
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false, // Make userId non-nullable to enforce the one-to-one relationship
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = Face;
