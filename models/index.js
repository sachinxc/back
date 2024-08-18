const sequelize = require("../config/database");
const User = require("./user");
const Post = require("./post");
const Media = require("./media");
const Comment = require("./comment");
const Like = require("./like");
const Face = require("./face");
const UserFollows = require("./userfollows");

// Define associations
User.hasMany(Post, { foreignKey: "userId", as: "posts" });
Post.belongsTo(User, { foreignKey: "userId", as: "user" });

Post.hasMany(Media, { foreignKey: "postId", as: "media" });
Media.belongsTo(Post, { foreignKey: "postId", as: "post" });

User.hasMany(Comment, { foreignKey: "userId", as: "comments" });
Post.hasMany(Comment, { foreignKey: "postId", as: "comments" });
Comment.belongsTo(User, { foreignKey: "userId", as: "user" });
Comment.belongsTo(Post, { foreignKey: "postId", as: "post" });

User.hasMany(Like, { foreignKey: "userId", as: "likes" });
Post.hasMany(Like, { foreignKey: "postId", as: "likes" });
Like.belongsTo(User, { foreignKey: "userId", as: "user" });
Like.belongsTo(Post, { foreignKey: "postId", as: "post" });

// Define the one-to-one relationship between User and Face
User.hasOne(Face, { foreignKey: "userId", as: "face" });
Face.belongsTo(User, { foreignKey: "userId", as: "user" });

// Define user follows relationships
User.belongsToMany(User, {
  through: UserFollows,
  as: "following",
  foreignKey: "followerId",
});
User.belongsToMany(User, {
  through: UserFollows,
  as: "followers",
  foreignKey: "followingId",
});

module.exports = {
  sequelize,
  User,
  Post,
  Media,
  Comment,
  Like,
  Face,
  UserFollows,
};
