/*const express = require("express");
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
const { imageRecognition } = require("./imageRecognition"); // Import image recognition service

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
        const captionResponse = await imageRecognition(resizedImageBuffer); // Use the resized image buffer
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

    await sendToBlockchain(
      blockchainData,
      req.headers.authorization.split(" ")[1]
    );

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

module.exports = router;*/

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
const { validateActivityLog } = require("./validateActivityLog"); // Import the validation function
const { sendToBlockchain } = require("./blockchainService"); // Import blockchain service
const { imageRecognition } = require("./imageRecognition"); // Import image recognition service
const fs = require("fs").promises; // For writing files to disk
const path = require("path"); // For constructing file paths

const UPLOADS_DIR = path.join(__dirname, "../uploads"); // Define where files will be saved on disk

// Ensure the uploads directory exists
const ensureUploadsDirectory = async () => {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error("Error creating uploads directory:", err);
    throw err;
  }
};

// Set up memory storage with multer
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory as Buffer
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

// Function to write file from memory buffer to disk
const saveFileToDisk = async (fileBuffer, originalFilename) => {
  await ensureUploadsDirectory(); // Ensure the uploads directory exists
  const filename = `${Date.now()}_${originalFilename}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(filePath, fileBuffer);
  return `/uploads/${filename}`; // Return the file path to save in the database
};

// Updated createPost function with both memory storage and disk storage
const createPost = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    title,
    category,
    description,
    location,
    activityLog,
    walletAddress,
    metadata,
  } = req.body;

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
    // Create the post entry in the database
    const post = await Post.create({
      title,
      category,
      description,
      location,
      activityLog: JSON.stringify(parsedActivityLog),
      userId: req.user.id,
    });

    console.log("Files received:", req.files);

    const exifData = JSON.parse(metadata || "{}");
    const captions = [];

    // Check if files exist and process them from memory
    if (req.files && req.files.length) {
      const filePromises = req.files.map(async (file) => {
        try {
          // The file is in memory, directly available as Buffer (file.buffer)
          const fileBuffer = file.buffer;

          // Image recognition API call using the in-memory buffer
          const captionResponse = await imageRecognition(fileBuffer);
          console.log("Caption API Response:", captionResponse);

          // Process caption response
          if (captionResponse && captionResponse[0]) {
            captions.push(captionResponse[0].generated_text);
          } else {
            console.warn("No caption generated for image");
          }

          // Save the file from memory to disk after processing
          const fileUrl = await saveFileToDisk(fileBuffer, file.originalname);

          // Store media entry with the file's URL in the database
          await Media.create({
            url: fileUrl, // The file's path on disk
            userId: req.user.id,
            postId: post.id,
          });
        } catch (err) {
          console.error(`Error processing file ${file.originalname}`, err);
        }
      });

      // Wait for all files to be processed (using Promise.allSettled for fault-tolerance)
      await Promise.allSettled(filePromises);
    }

    // Update the activity log with EXIF data and captions
    const updatedActivityLog = {
      ...parsedActivityLog,
      exifData,
      captions,
    };

    // Update the post with the updated activity log
    await post.update({ activityLog: JSON.stringify(updatedActivityLog) });

    // Prepare contribution for blockchain
    const contribution = `Title: ${title}, Category: ${category}, Description: ${description}, Location: ${location}, ActivityLog: ${JSON.stringify(
      updatedActivityLog
    )}`;

    const blockchainData = {
      minerAddress: walletAddress,
      contribution,
      reward: 50,
    };

    // Send data to blockchain
    await sendToBlockchain(
      blockchainData,
      req.headers.authorization.split(" ")[1]
    );

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
        await fs.unlink(mediaPath); // Remove file from disk
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

