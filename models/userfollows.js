const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserFollows = sequelize.define("UserFollows", {
  followerId: {
    type: DataTypes.INTEGER,
    references: {
      model: "Users",
      key: "id",
    },
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
  },
  followingId: {
    type: DataTypes.INTEGER,
    references: {
      model: "Users",
      key: "id",
    },
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
  },
});

module.exports = UserFollows;
