/*const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Post = require("../models/post");
const Media = require("../models/media");
const User = require("../models/user");
const Comment = require("../models/comment");
const Like = require("../models/like");
const sequelize = require("../config/database");
const auth = require("../middleware/auth");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "video/mp4") {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type, only images and mp4 videos are allowed!"),
        false
      );
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Utility function to handle errors
const handleErrors = (res, error, message) => {
  console.error(message, error);
  res.status(500).send(message);
};

// Controller functions
const createPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, category, description, location } = req.body;

  try {
    console.log('Files received:', req.files); // Add this line to debug
    const post = await Post.create({
      title,
      category,
      description,
      location,
      userId: req.user.id,
    });

    if (req.files && req.files.length) {
      for (let file of req.files) {
        await Media.create({
          url: `/uploads/${file.filename}`,
          userId: req.user.id,
          postId: post.id,
        });
      }
    }

    res.status(201).send(post);
  } catch (err) {
    handleErrors(res, err, "Error creating post");
  }
};

const likePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.id;
    const post = await Post.findByPk(postId);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    const existingLike = await Like.findOne({ where: { postId, userId } });
    let userHasLiked;

    if (existingLike) {
      await existingLike.destroy();
      userHasLiked = false; // User unliked the post
    } else {
      await Like.create({ postId, userId });
      userHasLiked = true; // User liked the post
    }

    const likes = await Like.findAll({ where: { postId } });
    res.send({
      likes: likes.map((like) => like.userId),
      userHasLiked,
    });
  } catch (err) {
    handleErrors(res, err, "Error updating like status");
  }
};

const getComments = async (req, res) => {
  try {
    const postId = req.params.postId;

    const comments = await Comment.findAll({
      where: { postId },
      include: [{ model: User, as: "user", attributes: ["username"] }],
      order: [["createdAt", "ASC"]],
    });

    res.send(comments);
  } catch (err) {
    handleErrors(res, err, "Error fetching comments");
  }
};

const addComment = async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.trim() === "") {
    return res.status(400).send("Invalid comment content");
  }

  try {
    const postId = req.params.postId;
    const userId = req.user.id;

    const comment = await Comment.create({
      content,
      userId,
      postId,
    });

    const commentWithUser = await Comment.findOne({
      where: { id: comment.id },
      include: [{ model: User, as: "user", attributes: ["username"] }],
    });

    res.send(commentWithUser);
  } catch (err) {
    handleErrors(res, err, "Error adding comment");
  }
};

const deleteComment = async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      return res.status(404).send("Comment not found");
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).send("Not authorized to delete this comment");
    }

    await comment.destroy();
    res.send("Comment deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting comment");
  }
};

const viewFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const postsWithMedia = await Promise.all(
      posts.map(async (post) => {
        const media = await Media.findAll({ where: { postId: post.id } });
        const likes = await Like.findAll({ where: { postId: post.id } });
        const comments = await Comment.findAll({ where: { postId: post.id } });
        return {
          ...post.toJSON(),
          media,
          likes: likes.map((like) => like.userId),
          comments: comments.map((comment) => comment.userId),
          dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
        };
      })
    );

    res.send(postsWithMedia);
  } catch (err) {
    handleErrors(res, err, "Error fetching feed");
  }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) {
      return res.status(404).send("Post not found");
    }
    if (post.userId !== req.user.id) {
      return res.status(403).send("Not authorized");
    }
    await Comment.destroy({ where: { postId: post.id } });
    await Media.destroy({ where: { postId: post.id } });
    await Like.destroy({ where: { postId: post.id } });
    await post.destroy();
    res.send("Post and associated media deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting post");
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        { model: Media, as: "media" },
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
        {
          model: Like,
          as: "likes",
          attributes: ["userId"],
        },
      ],
    });

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Check if the current user has liked the post
    const userHasLiked = await Like.findOne({
      where: { postId: post.id, userId: req.user.id },
    });

    // Include userHasLiked flag in the response
    res.send({
      ...post.toJSON(),
      userHasLiked: !!userHasLiked, // Convert to boolean
      dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
    });
  } catch (err) {
    handleErrors(res, err, "Error fetching post by ID");
  }
};

// Route Definitions
router.post(
  "/create",
  auth,
  upload.array("media", 5),
  [
    body("title")
      .isLength({ min: 5, max: 100 })
      .withMessage("Title must be between 5 and 100 characters"),
    body("category").notEmpty().withMessage("Category is required"),
    body("description")
      .isLength({ min: 10, max: 2000 })
      .withMessage("Description must be between 10 and 1000 characters"),
    body("location").notEmpty().withMessage("Location is required"),
  ],
  createPost
);

router.post("/:postId/like", auth, likePost);
router.post("/:postId/comment", auth, addComment);
router.get("/:postId/comments", auth, getComments);
router.delete("/:postId/comment/:commentId", auth, deleteComment);
router.get("/feed", auth, viewFeed);
router.get("/:id", auth, getPostById);
router.delete("/delete/:id", auth, deletePost);

module.exports = router;*/

/*const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Post = require("../models/post");
const Media = require("../models/media");
const User = require("../models/user");
const Comment = require("../models/comment");
const Like = require("../models/like");
const sequelize = require("../config/database");
const auth = require("../middleware/auth");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "video/mp4") {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type, only images and mp4 videos are allowed!"),
        false
      );
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Utility function to handle errors
const handleErrors = (res, error, message) => {
  console.error(message, error);
  res.status(500).send(message);
};

// Controller functions
const createPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, category, description, location, activityLog } = req.body;

  try {
    console.log('Files received:', req.files); // Add this line to debug
    const post = await Post.create({
      title,
      category,
      description,
      location,
      activityLog,
      userId: req.user.id,
    });

    if (req.files && req.files.length) {
      for (let file of req.files) {
        await Media.create({
          url: `/uploads/${file.filename}`,
          userId: req.user.id,
          postId: post.id,
        });
      }
    }

    res.status(201).send(post);
  } catch (err) {
    handleErrors(res, err, "Error creating post");
  }
};

const likePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.id;
    const post = await Post.findByPk(postId);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    const existingLike = await Like.findOne({ where: { postId, userId } });
    let userHasLiked;

    if (existingLike) {
      await existingLike.destroy();
      userHasLiked = false; // User unliked the post
    } else {
      await Like.create({ postId, userId });
      userHasLiked = true; // User liked the post
    }

    const likes = await Like.findAll({ where: { postId } });
    res.send({
      likes: likes.map((like) => like.userId),
      userHasLiked,
    });
  } catch (err) {
    handleErrors(res, err, "Error updating like status");
  }
};

const getComments = async (req, res) => {
  try {
    const postId = req.params.postId;

    const comments = await Comment.findAll({
      where: { postId },
      include: [{ model: User, as: "user", attributes: ["username"] }],
      order: [["createdAt", "ASC"]],
    });

    res.send(comments);
  } catch (err) {
    handleErrors(res, err, "Error fetching comments");
  }
};

const addComment = async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.trim() === "") {
    return res.status(400).send("Invalid comment content");
  }

  try {
    const postId = req.params.postId;
    const userId = req.user.id;

    const comment = await Comment.create({
      content,
      userId,
      postId,
    });

    const commentWithUser = await Comment.findOne({
      where: { id: comment.id },
      include: [{ model: User, as: "user", attributes: ["username"] }],
    });

    res.send(commentWithUser);
  } catch (err) {
    handleErrors(res, err, "Error adding comment");
  }
};

const deleteComment = async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      return res.status(404).send("Comment not found");
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).send("Not authorized to delete this comment");
    }

    await comment.destroy();
    res.send("Comment deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting comment");
  }
};

const viewFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const postsWithMedia = await Promise.all(
      posts.map(async (post) => {
        const media = await Media.findAll({ where: { postId: post.id } });
        const likes = await Like.findAll({ where: { postId: post.id } });
        const comments = await Comment.findAll({ where: { postId: post.id } });
        return {
          ...post.toJSON(),
          media,
          likes: likes.map((like) => like.userId),
          comments: comments.map((comment) => comment.userId),
          dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
        };
      })
    );

    res.send(postsWithMedia);
  } catch (err) {
    handleErrors(res, err, "Error fetching feed");
  }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) {
      return res.status(404).send("Post not found");
    }
    if (post.userId !== req.user.id) {
      return res.status(403).send("Not authorized");
    }
    await Comment.destroy({ where: { postId: post.id } });
    await Media.destroy({ where: { postId: post.id } });
    await Like.destroy({ where: { postId: post.id } });
    await post.destroy();
    res.send("Post and associated media deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting post");
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        { model: Media, as: "media" },
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
        {
          model: Like,
          as: "likes",
          attributes: ["userId"],
        },
      ],
    });

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Check if the current user has liked the post
    const userHasLiked = await Like.findOne({
      where: { postId: post.id, userId: req.user.id },
    });

    // Include userHasLiked flag in the response
    res.send({
      ...post.toJSON(),
      userHasLiked: !!userHasLiked, // Convert to boolean
      dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
    });
  } catch (err) {
    handleErrors(res, err, "Error fetching post by ID");
  }
};

// Route Definitions
router.post(
  "/create",
  auth,
  upload.array("media", 5),
  [
    body("title")
      .isLength({ min: 5, max: 100 })
      .withMessage("Title must be between 5 and 100 characters"),
    body("category").notEmpty().withMessage("Category is required"),
    body("description")
      .isLength({ min: 10, max: 2000 })
      .withMessage("Description must be between 10 and 1000 characters"),
    body("location").notEmpty().withMessage("Location is required"),
    body("activityLog")
  ],
  createPost
);

router.post("/:postId/like", auth, likePost);
router.post("/:postId/comment", auth, addComment);
router.get("/:postId/comments", auth, getComments);
router.delete("/:postId/comment/:commentId", auth, deleteComment);
router.get("/feed", auth, viewFeed);
router.get("/:id", auth, getPostById);
router.delete("/delete/:id", auth, deletePost);

module.exports = router;*/

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Post = require("../models/post");
const Media = require("../models/media");
const User = require("../models/user");
const Comment = require("../models/comment");
const Like = require("../models/like");
const sequelize = require("../config/database");
const auth = require("../middleware/auth");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "video/mp4") {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type, only images and mp4 videos are allowed!"),
        false
      );
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Utility function to handle errors
const handleErrors = (res, error, message) => {
  console.error(message, error);
  res.status(500).send(message);
};

// Controller functions
const createPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, category, description, location, activityLog } = req.body;

  try {
    // Parse the activity log string into a JSON object
    const parsedLog = JSON.parse(activityLog);

    // Validate face recognition data
    const faceRecognitionData = parsedLog['Face Recognition Data'];
    const allFacesRecognized = faceRecognitionData.every(entry => entry.status === 'success');
    
    if (!allFacesRecognized) {
      return res.status(400).send('Face recognition data contains unrecognized faces');
    }

    // Compare location coordinates from location field and activity log
    const providedCoordinates = JSON.parse(location);
    const activityLocationData = parsedLog['Location Data'];

    if (activityLocationData.length === 0) {
      return res.status(400).send('Activity log contains no location data');
    }

    const logCoordinates = activityLocationData[0]; // Assuming the first entry is relevant for comparison

    // Calculate the distance between provided coordinates and activity log coordinates
    const distance = calculateDistance(
      providedCoordinates.latitude, 
      providedCoordinates.longitude, 
      logCoordinates.latitude, 
      logCoordinates.longitude
    );

    // Define a threshold for location match (e.g., 100 meters)
    const isLocationMatch = distance <= 100;
    const verificationPercentage = isLocationMatch ? 100 : (1 - (distance / 100)) * 100;

    // Add verification percentage to activity log
    parsedLog.verificationPercentage = verificationPercentage;

    // Convert the augmented activity log back to a string
    const updatedActivityLog = JSON.stringify(parsedLog);

    // Create the post with the modified activity log
    const post = await Post.create({
      title,
      category,
      description,
      location,
      activityLog: updatedActivityLog, // Save the modified activity log as a string
      userId: req.user.id,
    });

    // Save media files, if any
    if (req.files && req.files.length) {
      for (let file of req.files) {
        await Media.create({
          url: `/uploads/${file.filename}`,
          userId: req.user.id,
          postId: post.id,
        });
      }
    }

    res.status(201).send(post);
  } catch (err) {
    handleErrors(res, err, "Error creating post with activity log validation");
  }
};

// Utility function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = value => (value * Math.PI) / 180;

  const R = 6371e3; // Radius of Earth in meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in meters
  return distance;
}


const likePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.id;
    const post = await Post.findByPk(postId);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    const existingLike = await Like.findOne({ where: { postId, userId } });
    let userHasLiked;

    if (existingLike) {
      await existingLike.destroy();
      userHasLiked = false; // User unliked the post
    } else {
      await Like.create({ postId, userId });
      userHasLiked = true; // User liked the post
    }

    const likes = await Like.findAll({ where: { postId } });
    res.send({
      likes: likes.map((like) => like.userId),
      userHasLiked,
    });
  } catch (err) {
    handleErrors(res, err, "Error updating like status");
  }
};

const getComments = async (req, res) => {
  try {
    const postId = req.params.postId;

    const comments = await Comment.findAll({
      where: { postId },
      include: [{ model: User, as: "user", attributes: ["username"] }],
      order: [["createdAt", "ASC"]],
    });

    res.send(comments);
  } catch (err) {
    handleErrors(res, err, "Error fetching comments");
  }
};

const addComment = async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.trim() === "") {
    return res.status(400).send("Invalid comment content");
  }

  try {
    const postId = req.params.postId;
    const userId = req.user.id;

    const comment = await Comment.create({
      content,
      userId,
      postId,
    });

    const commentWithUser = await Comment.findOne({
      where: { id: comment.id },
      include: [{ model: User, as: "user", attributes: ["username"] }],
    });

    res.send(commentWithUser);
  } catch (err) {
    handleErrors(res, err, "Error adding comment");
  }
};

const deleteComment = async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      return res.status(404).send("Comment not found");
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).send("Not authorized to delete this comment");
    }

    await comment.destroy();
    res.send("Comment deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting comment");
  }
};

const viewFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const postsWithMedia = await Promise.all(
      posts.map(async (post) => {
        const media = await Media.findAll({ where: { postId: post.id } });
        const likes = await Like.findAll({ where: { postId: post.id } });
        const comments = await Comment.findAll({ where: { postId: post.id } });
        return {
          ...post.toJSON(),
          media,
          likes: likes.map((like) => like.userId),
          comments: comments.map((comment) => comment.userId),
          dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
        };
      })
    );

    res.send(postsWithMedia);
  } catch (err) {
    handleErrors(res, err, "Error fetching feed");
  }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) {
      return res.status(404).send("Post not found");
    }
    if (post.userId !== req.user.id) {
      return res.status(403).send("Not authorized");
    }
    await Comment.destroy({ where: { postId: post.id } });
    await Media.destroy({ where: { postId: post.id } });
    await Like.destroy({ where: { postId: post.id } });
    await post.destroy();
    res.send("Post and associated media deleted");
  } catch (err) {
    handleErrors(res, err, "Error deleting post");
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        { model: Media, as: "media" },
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "firstName", "lastName"],
        },
        {
          model: Like,
          as: "likes",
          attributes: ["userId"],
        },
      ],
    });

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Check if the current user has liked the post
    const userHasLiked = await Like.findOne({
      where: { postId: post.id, userId: req.user.id },
    });

    // Include userHasLiked flag in the response
    res.send({
      ...post.toJSON(),
      userHasLiked: !!userHasLiked, // Convert to boolean
      dateTime: post.createdAt, // Explicitly pass createdAt as dateTime
    });
  } catch (err) {
    handleErrors(res, err, "Error fetching post by ID");
  }
};

// Route Definitions
router.post(
  "/create",
  auth,
  upload.array("media", 5),
  [
    body("title")
      .isLength({ min: 5, max: 100 })
      .withMessage("Title must be between 5 and 100 characters"),
    body("category").notEmpty().withMessage("Category is required"),
    body("description")
      .isLength({ min: 10, max: 2000 })
      .withMessage("Description must be between 10 and 1000 characters"),
    body("location").notEmpty().withMessage("Location is required"),
    body("activityLog")
  ],
  createPost
);

router.post("/:postId/like", auth, likePost);
router.post("/:postId/comment", auth, addComment);
router.get("/:postId/comments", auth, getComments);
router.delete("/:postId/comment/:commentId", auth, deleteComment);
router.get("/feed", auth, viewFeed);
router.get("/:id", auth, getPostById);
router.delete("/delete/:id", auth, deletePost);

module.exports = router;

