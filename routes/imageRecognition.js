// imageRecognition.js

const fetch = require("node-fetch");

const imageRecognition = async (imageBuffer, retries = 5) => {
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

module.exports = {
  imageRecognition,
};
