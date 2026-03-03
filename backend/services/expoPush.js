const axios = require('axios');
const User = require('../models/User');

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_BATCH_SIZE = 100;
const VALID_EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

const normalizePushToken = (value = '') => String(value || '').trim();

const isValidExpoPushToken = (value = '') => VALID_EXPO_PUSH_TOKEN.test(normalizePushToken(value));

const dedupeValidTokens = (tokens = []) => {
  const seen = new Set();
  const list = [];

  for (const item of tokens) {
    const token = normalizePushToken(item?.token || item);
    if (!isValidExpoPushToken(token) || seen.has(token)) continue;
    seen.add(token);
    list.push(token);
  }

  return list;
};

const chunk = (list = [], size = PUSH_BATCH_SIZE) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
};

const sendPushToTokens = async (tokens = [], payload = {}) => {
  const recipients = dedupeValidTokens(tokens);
  if (recipients.length === 0) {
    return { sent: 0, invalidTokens: [], failed: false };
  }

  const invalidTokens = [];
  const batches = chunk(recipients, PUSH_BATCH_SIZE);

  for (const batch of batches) {
    const messages = batch.map((token) => ({
      to: token,
      title: String(payload?.title || 'RubberSense'),
      body: String(payload?.body || ''),
      data: payload?.data || {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));

    try {
      const { data } = await axios.post(EXPO_PUSH_SEND_URL, messages, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const tickets = Array.isArray(data?.data) ? data.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(batch[idx]);
        }
      });
    } catch (error) {
      console.error('Expo push send failed:', error?.response?.data || error.message);
      return { sent: 0, invalidTokens: [], failed: true };
    }
  }

  return { sent: recipients.length, invalidTokens, failed: false };
};

const removeUserPushTokens = async (userId, tokens = []) => {
  if (!userId || !Array.isArray(tokens) || tokens.length === 0) return;

  await User.updateOne(
    { _id: userId },
    {
      $pull: {
        pushTokens: {
          token: { $in: tokens }
        }
      }
    }
  );
};

const sendPushToUser = async (userId, payload = {}) => {
  if (!userId) {
    return { sent: 0, invalidTokens: [], failed: false };
  }

  const user = await User.findById(userId).select('pushTokens');
  if (!user) {
    return { sent: 0, invalidTokens: [], failed: false };
  }

  const result = await sendPushToTokens(user.pushTokens || [], payload);
  if (result.invalidTokens.length > 0) {
    await removeUserPushTokens(userId, result.invalidTokens);
  }

  return result;
};

module.exports = {
  isValidExpoPushToken,
  sendPushToUser,
  sendPushToTokens,
  normalizePushToken,
};

