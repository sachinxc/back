const express = require("express");
const router = express.Router();
const { Face } = require("../models");
const auth = require("../middleware/auth"); // Import the auth middleware

// Register a new face
router.post("/register", auth, async (req, res) => {
  const { label, descriptor } = req.body;

  try {
    // Validate input
    if (!label || !descriptor || !Array.isArray(descriptor)) {
      return res
        .status(400)
        .send(
          "Invalid input: label and descriptor are required, and descriptor must be an array."
        );
    }

    // Convert the descriptor array to a JSON string
    const descriptorString = JSON.stringify(descriptor);

    // Create a new face record with the descriptor stored as a JSON string
    const face = await Face.create({
      label,
      descriptor: descriptorString,
      userId: req.user.id, // Use authenticated user's ID
    });

    res.status(201).json({ id: face.id, label: face.label }); // Return the created face's ID and label
  } catch (err) {
    console.error("Error during face registration:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// Get all registered faces for the authenticated user
router.get("/faces", auth, async (req, res) => {
  try {
    const faces = await Face.findAll({ where: { userId: req.user.id } }); // Filter by userId

    // Convert descriptors from JSON string to array before sending the response
    const formattedFaces = faces.map((face) => {
      const descriptorArray = JSON.parse(face.descriptor); // Parse JSON string to array

      // Log the length of the descriptor array for debugging
      console.log(
        `Descriptor Length for ${face.label}:`,
        descriptorArray.length
      );

      return {
        id: face.id,
        label: face.label,
        descriptor: descriptorArray, // Send descriptor as a regular array
      };
    });

    res.status(200).json(formattedFaces);
  } catch (err) {
    console.error("Error fetching faces:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// Delete a face by ID (ensure the user owns the face)
router.delete("/faces/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const face = await Face.findOne({ where: { id, userId: req.user.id } }); // Ensure face belongs to the authenticated user
    if (!face) {
      return res.status(404).json({ error: "Face not found or unauthorized" });
    }

    await face.destroy();
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Error deleting face:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

module.exports = router;
