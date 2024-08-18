const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Media = sequelize.define(
  "Media",
  {
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Users",
        key: "id",
      },
      allowNull: false,
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    postId: {
      type: DataTypes.INTEGER,
      references: {
        model: "Posts",
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

module.exports = Media;
