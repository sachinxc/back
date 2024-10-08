// imageProcessor.js
const sharp = require("sharp");
const exifParser = require("exif-parser");

// Function to resize images using in-memory buffer
const resizeImage = async (buffer, filename) => {
  const outputPath = `uploads/${filename}`; // Save using unique filename
  await sharp(buffer)
    .rotate() // Automatically rotate based on EXIF orientation
    .resize({
      width: 1200,
      height: 630,
      fit: "inside",
    })
    .toFile(outputPath); // Save the resized image
  return `/uploads/${filename}`; // Return unique URL
};

// Function to extract EXIF data from JPEG images
const extractExifData = (buffer, mimetype) => {
  let exifData = null;
  if (mimetype === "image/jpeg") {
    const parser = exifParser.create(buffer);
    exifData = parser.parse();
  }
  return exifData ? exifData.tags : null;
};

// Function to handle file processing
const processFiles = async (files, userId, postId, Media) => {
  const exifDataArray = [];

  for (let file of files) {
    const fileBuffer = file.buffer;
    const exifData = extractExifData(fileBuffer, file.mimetype);
    const uniqueFilename = `${Date.now()}_${file.originalname}`;
    const resizedImagePath = await resizeImage(fileBuffer, uniqueFilename);

    // Store media entry in the database
    await Media.create({
      url: resizedImagePath,
      resizedUrl: resizedImagePath,
      userId,
      postId,
    });

    exifDataArray.push({
      filename: uniqueFilename,
      resizedImage: resizedImagePath,
      exif: exifData, // EXIF tags or null if not available
    });
  }

  return exifDataArray;
};

module.exports = { processFiles };
