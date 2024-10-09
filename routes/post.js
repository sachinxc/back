const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Post = require("../models/post");
const Media = require("../models/media");
const User = require("../models/user");
const Comment = require("../models/comment");
const Like = require("../models/like");
const auth = require("../middleware/auth");
const multer = require("multer");
const fs = require("fs");
const { validateActivityLog } = require("./validateActivityLog"); // Import the validation function
const { sendToBlockchain } = require("./blockchainService"); // Import blockchain service
const { processFiles } = require("./imageProcessor"); // Import image processing functions

const upload = multer({
  storage: multer.memoryStorage(), // Store in memory instead of disk
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

// Error handling utility function
const handleErrors = (res, error, message) => {
  console.error(message, error);
  res.status(500).send(message);
};

// Function to query the captioning model
const queryCaptionWithRetry = async (imageBuffer, retries = 5) => {
  const maxWaitTime = 16000; // Maximum wait time (16 seconds)
  let attempt = 0;

  while (attempt < retries) {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
      {
        headers: {
          Authorization: "Bearer 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",
          "Content-Type": "application/json",
        },
        method: "POST",
        body: imageBuffer,
      }
    );

    const result = await response.json();

    // Check for successful response
    if (response.ok && result && result[0]) {
      return result;
    }

    // Handle loading state and log
    if (result.error && result.error.includes("currently loading")) {
      console.warn("Model is loading, retrying...");
      const waitTime = Math.min(maxWaitTime, 2000 * Math.pow(2, attempt)); // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, waitTime)); // Wait before retrying
      attempt++;
      continue; // Retry
    }

    // Log any other errors returned by the API
    console.error("Error fetching caption:", result.error);
    break; // Break the loop on other errors
  }

  // If we reach here, we exhausted retries without success
  return []; // Return empty array if no caption was generated
};

const createPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, category, description, location, activityLog, walletAddress } =
    req.body;
  let parsedActivityLog = null;

  if (activityLog) {
    try {
      const userProvidedLocation = location
        .split(",")
        .map((coord) => parseFloat(coord.trim()));
      parsedActivityLog = validateActivityLog(
        activityLog,
        userProvidedLocation
      );
    } catch (err) {
      return res.status(400).send("Invalid activity log format");
    }
  }

  try {
    const post = await Post.create({
      title,
      category,
      description,
      location,
      activityLog: JSON.stringify(parsedActivityLog),
      userId: req.user.id,
    });

    console.log("Files received:", req.files);

    // Process the files and get resized images and EXIF data
    const { exifDataArray, resizedImageBuffers } =
      req.files && req.files.length
        ? await processFiles(req.files, req.user.id, post.id, Media)
        : { exifDataArray: [], resizedImageBuffers: [] };

    const captions = [];

    // Fetch captions for each resized image
    const captionPromises = resizedImageBuffers.map(
      async (resizedImageBuffer) => {
        const captionResponse = await queryCaptionWithRetry(resizedImageBuffer); // Use the resized image buffer
        console.log("Caption API Response:", captionResponse);
        if (captionResponse && captionResponse[0]) {
          captions.push(captionResponse[0].generated_text); // Extract the caption
        } else {
          console.warn("No caption generated for image");
        }
      }
    );

    await Promise.all(captionPromises); // Wait for all captions to be fetched

    const updatedActivityLog = {
      ...parsedActivityLog,
      exifData: exifDataArray,
      captions: captions, // Add captions to the activity log
    };

    await post.update({
      activityLog: JSON.stringify(updatedActivityLog),
    });

    const contribution = `Title: ${title}, Category: ${category}, Description: ${description}, Location: ${location}, ActivityLog: ${JSON.stringify(
      updatedActivityLog
    )}`;

    const blockchainData = {
      minerAddress: walletAddress,
      contribution,
      reward: 50,
    };

    try {
      const blockchainResponse = await sendToBlockchain(
        blockchainData,
        req.headers.authorization.split(" ")[1]
      );
      console.log("Blockchain response:", blockchainResponse);
    } catch (blockchainError) {
      return res.status(500).send("Error sending data to blockchain");
    }

    res.status(201).send({ post, activityLog: updatedActivityLog });
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

    // Find all media associated with the post
    const mediaFiles = await Media.findAll({ where: { postId: post.id } });

    // Delete media files from file system
    for (let media of mediaFiles) {
      const mediaPath = media.url.replace("/uploads/", "uploads/");
      try {
        await fs.promises.unlink(mediaPath); // Remove file from disk
        console.log(`Deleted media file: ${mediaPath}`);
      } catch (err) {
        console.error(`Error deleting file: ${mediaPath}`, err);
      }
    }

    // Now delete all associated entries in the database
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
      .withMessage("Description must be between 10 and 2000 characters"),
    body("location").notEmpty().withMessage("Location is required"),
    body("activityLog"),
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
