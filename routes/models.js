const express = require("express");
const path = require("path");
const router = express.Router();

const MODEL_DIR = path.join(__dirname, "../aimodels");

router.get("/:fileName", (req, res) => {
  const { fileName } = req.params;
  const modelPath = path.join(MODEL_DIR, fileName);

  res.sendFile(modelPath, (err) => {
    if (err) {
      res.status(404).send("Model not found");
    }
  });
});

module.exports = router;
