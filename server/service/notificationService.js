import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  const messages = [{
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data, // Optional data (e.g., coordinates to open map)
    priority: 'high',
  }];

  try {
    // Send the chunks to the Expo push notification service
    const ticketChunk = await expo.sendPushNotificationsAsync(messages);
    console.log('Notification sent:', ticketChunk);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};