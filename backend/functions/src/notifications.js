const admin = require("firebase-admin");

/**
 * Sends a notification to a specific user (both FCM push and Firestore document).
 */
async function sendUserNotification({ userId, title, body, data = {} }) {
  const db = admin.firestore();

  // 1. Create in-app notification doc
  const notifRef = db.collection("notifications").doc();
  await notifRef.set({
    id: notifRef.id,
    userId,
    title,
    message: body,
    data,
    read: false,
    timestamp: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 2. Try FCM push if user device has FCM token registered
  try {
    const deviceSnap = await db.collection("driverDevices")
      .where("driverId", "==", userId)
      .where("fcmToken", "!=", null)
      .limit(1)
      .get();

    if (!deviceSnap.empty) {
      const fcmToken = deviceSnap.docs[0].data().fcmToken;
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: { title, body },
          data: Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          )
        });
      }
    }
  } catch (err) {
    console.warn(`FCM push failed for user ${userId}:`, err.message);
  }

  return notifRef.id;
}

module.exports = {
  sendUserNotification
};
