import {
  LEGACY_TOPIC_LABEL_TO_KEY,
  SURVEY_SCHEMA_VERSION,
  TOPIC_KEYS,
} from "../config/surveySchema";

const STORAGE_KEY = "ITS_SCORECARD_SURVEY_UPDATES";

export { TOPIC_KEYS };

function emptyAnswerStore() {
  return {
    schemaVersion: SURVEY_SCHEMA_VERSION,
    answersByTopic: {},
  };
}

function normalizeStoredPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return emptyAnswerStore();
  }

  if (
    typeof payload.schemaVersion === "number" &&
    payload.answersByTopic &&
    typeof payload.answersByTopic === "object"
  ) {
    return {
      schemaVersion: SURVEY_SCHEMA_VERSION,
      answersByTopic: payload.answersByTopic,
    };
  }

  const migratedAnswers = {};
  for (const [rawKey, value] of Object.entries(payload)) {
    const topicKey = LEGACY_TOPIC_LABEL_TO_KEY[rawKey] || rawKey;
    if (topicKey && value && typeof value === "object") {
      migratedAnswers[topicKey] = value;
    }
  }

  return {
    schemaVersion: SURVEY_SCHEMA_VERSION,
    answersByTopic: migratedAnswers,
  };
}

export function loadSurveyAnswers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const normalized = normalizeStoredPayload(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized.answersByTopic;
  } catch (error) {
    return {};
  }
}

export function saveSurveyAnswers(answersByTopic) {
  const payload = {
    schemaVersion: SURVEY_SCHEMA_VERSION,
    answersByTopic: answersByTopic || {},
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getTopicAnswers(allAnswers, topicKey) {
  return allAnswers?.[topicKey] || {};
}
