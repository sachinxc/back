const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Post = require("../models/post");
const Media = require("../models/media");
const auth = require("../middleware/auth");

// Follow/Unfollow
router.post("/follow/:id", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const followUser = await User.findByPk(req.params.id);
    if (!followUser) return res.status(404).send("User not found");

    const isFollowing = await user.hasFollowing(followUser);
    if (isFollowing) {
      await user.removeFollowing(followUser);
    } else {
      await user.addFollowing(followUser);
    }

    res.send("Follow status updated");
  } catch (err) {
    console.error("Error updating follow status:", err);
    res.status(500).send("Error updating follow status");
  }
});

// Update Bio
router.put("/bio", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).send("User not found");
    }
    user.bio = req.body.bio;
    await user.save();
    res.send("Bio updated");
  } catch (err) {
    console.error("Error updating bio:", err);
    res.status(500).send("Error updating bio");
  }
});

// Update Profile Pic
router.put("/profile-pic", auth, async (req, res) => {
  try {
    if (req.user.id !== req.body.userId) {
      return res.status(403).send("Unauthorized action");
    }

    const user = await User.findByPk(req.user.id);
    const media = await Media.create({ url: req.body.url, userId: user.id });
    user.profilePic = media.url;
    await user.save();
    res.send("Profile picture updated");
  } catch (err) {
    console.error("Error updating profile picture:", err);
    res.status(500).send("Error updating profile picture");
  }
});

// Fetch Profile
router.get("/profile/:id", auth, async (req, res) => {
  try {
    const userId = req.params.id === "me" ? req.user.id : req.params.id;
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Post,
          as: "posts",
          attributes: ["id", "title", "description", "category", "location"],
        },
        {
          model: User,
          as: "followers",
          attributes: ["id", "username"],
        },
        {
          model: User,
          as: "following",
          attributes: ["id", "username"],
        },
      ],
    });

    if (!user) {
      return res.status(404).send("User not found");
    }

    const postsWithMedia = await Promise.all(
      user.posts.map(async (post) => {
        const media = await Media.findAll({ where: { postId: post.id } });
        return { ...post.toJSON(), media };
      })
    );

    res.send({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      bio: user.bio,
      profilePic: user.profilePic,
      followers: user.followers,
      following: user.following,
      posts: postsWithMedia,
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).send("Error fetching profile");
  }
});

module.exports = router;
