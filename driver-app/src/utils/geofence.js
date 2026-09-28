/**
 * Calculate distance between two GPS coordinates in meters
 */
export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Checks if current GPS is within an authorized hub radius
 */
export function checkHubProximity(userGps, hub) {
  if (!userGps || !hub || !hub.latitude || !hub.longitude) {
    return { within: false, distance: null, reason: 'Missing GPS coordinates' };
  }

  const distance = getDistanceInMeters(
    userGps.latitude,
    userGps.longitude,
    hub.latitude,
    hub.longitude
  );

  const allowedRadius = hub.radiusMeters || 300;

  return {
    within: distance <= allowedRadius,
    distance,
    allowedRadius,
    hubName: hub.name
  };
}
