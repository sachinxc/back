// validateActivityLog.js

// Function to calculate distance using the Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

const validateActivityLog = (activityLog, userProvidedLocation) => {
  const parsedActivityLog = JSON.parse(activityLog);
  
  // Face Recognition Validation
  const totalFaceRecognitionCount = parsedActivityLog.faceRecognitionData.length;
  const successfulRecognitions = parsedActivityLog.faceRecognitionData.filter(data => data.status === "success");
  const recognitionSuccessCount = successfulRecognitions.length;
  const faceRecognitionFailureCount = totalFaceRecognitionCount - recognitionSuccessCount;

  // Location Verification
  const activityLocations = parsedActivityLog.locationData;
  const locationVerifications = [];
  let totalLocationSuccessCount = 0;
  const totalLocationCount = activityLocations.length;

  // Threshold for distance verification (100 meters)
  const distanceThreshold = 0.1; // 100 meters in degrees (approximately)

  activityLocations.forEach(activityLocation => {
    const distance = calculateDistance(userProvidedLocation[0], userProvidedLocation[1], activityLocation.latitude, activityLocation.longitude);
    const isLegitimate = distance <= distanceThreshold; // Check if within threshold

    // Record location verification
    locationVerifications.push({
      userProvided: {
        latitude: userProvidedLocation[0],
        longitude: userProvidedLocation[1]
      },
      activity: {
        latitude: activityLocation.latitude,
        longitude: activityLocation.longitude
      },
      isLegitimate,
      distance: distance.toFixed(2) // Distance in km, rounded to 2 decimal places
    });

    if (isLegitimate) {
      totalLocationSuccessCount++;
    }
  });

  // Count the number of failed location verifications
  const locationFailureCount = totalLocationCount - totalLocationSuccessCount;

  // Total counts for success and failure (face + location)
  const totalSuccessCount = recognitionSuccessCount + totalLocationSuccessCount;
  const totalFailureCount = faceRecognitionFailureCount + locationFailureCount;
  const totalVerificationCount = totalSuccessCount + totalFailureCount;

  // Calculate legitimacy percentage
  const legitimacyPercentage = ((totalSuccessCount / totalVerificationCount) * 100).toFixed(2);

  // Add verification data
  parsedActivityLog.verificationData = {
    userProvidedLocation: {
      latitude: userProvidedLocation[0],
      longitude: userProvidedLocation[1]
    },
    locationVerifications,
    totalFaceRecognitionCount,
    totalFaceRecognitionSuccessCount: recognitionSuccessCount,
    totalLocationCount,
    totalLocationSuccessCount,
    totalSuccessCount,
    totalFailureCount,
    totalVerificationCount,
    legitimacyPercentage
  };

  return parsedActivityLog;
};

module.exports = { validateActivityLog };
