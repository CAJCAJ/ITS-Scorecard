import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  QUESTION_BANK,
  TOPIC_OPTIONS,
  getTopicLabel,
  TOPIC_KEYS,
} from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers, saveSurveyAnswers } from "../utils/surveyUpdates";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const STATE_OPTIONS = ["Texas", "New Jersey"];

function commonSelectStyle() {
  return {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #cfd8e3",
    fontSize: "1rem",
    background: "#fff",
    boxSizing: "border-box",
  };
}

function Field({ question, value, onChange }) {
  const commonStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #d7dfea",
    fontSize: "1rem",
    boxSizing: "border-box",
    background: "#fff",
  };

  if (question.type === "textarea") {
    return (
      <textarea
        rows={4}
        value={value || ""}
        onChange={(event) => onChange(question.id, event.target.value)}
        placeholder={question.placeholder}
        style={{ ...commonStyle, resize: "vertical", minHeight: "110px" }}
      />
    );
  }

  if (question.type === "select") {
    return (
      <select
        value={value || ""}
        onChange={(event) => onChange(question.id, event.target.value)}
        style={commonStyle}
      >
        <option value="">Select an option</option>
        {question.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "multiselect") {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "grid", gap: "10px" }}>
        {question.options.map((option) => {
          const checked = selectedValues.includes(option);
          return (
            <label
              key={option}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #d7dfea",
                background: checked ? "rgba(0, 87, 255, 0.08)" : "#fff",
                fontSize: "0.98rem",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const nextValues = checked
                    ? selectedValues.filter((item) => item !== option)
                    : [...selectedValues, option];
                  onChange(question.id, nextValues);
                }}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <input
      type={question.type || "text"}
      value={value || ""}
      onChange={(event) => onChange(question.id, event.target.value)}
      placeholder={question.placeholder}
      style={commonStyle}
    />
  );
}

export default function SurveyBasedUpdates() {
  const [selectedTopicKey, setSelectedTopicKey] = useState("");
  const [answersByTopic, setAnswersByTopic] = useState(() => loadSurveyAnswers());
  const [surveyYear, setSurveyYear] = useState("2023");
  const [stateName, setStateName] = useState("Texas");
  const [respondentName, setRespondentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    saveSurveyAnswers(answersByTopic);
  }, [answersByTopic]);

  const topicQuestions = useMemo(
    () => QUESTION_BANK[selectedTopicKey] || [],
    [selectedTopicKey]
  );
  const topicPurposeText = useMemo(() => {
    if (selectedTopicKey === TOPIC_KEYS.BENEFIT_COST) {
      return "These inputs are used to calculate the annual ITS benefit/cost ratio and the unified B/C score from the monetized benefit and annual cost components.";
    }
    if (selectedTopicKey === TOPIC_KEYS.DEPLOYMENT_COVERAGE) {
      return "Use these inputs to describe how much of the applicable agency infrastructure, fleet, or program base currently has each ITS deployment domain in place. Enter percentages on a 0 to 100 scale.";
    }
    if (selectedTopicKey === TOPIC_KEYS.POLICY_LEGISLATION) {
      return "Use these inputs to capture the three policy-readiness components: foundational ITS documents in place, the distribution of legislative support levels across reviewed bills, and the percentage of ITS technology areas with clear supporting documentation.";
    }
    return "";
  }, [selectedTopicKey]);

  const handleAnswerChange = (questionId, nextValue) => {
    setMessage("");
    setError("");
    setAnswersByTopic((current) => ({
      ...current,
      [selectedTopicKey]: {
        ...(current[selectedTopicKey] || {}),
        [questionId]: nextValue,
      },
    }));
  };

  const currentAnswers = getTopicAnswers(answersByTopic, selectedTopicKey);

  const loadSavedAnswers = async () => {
    if (!selectedTopicKey || !surveyYear || !stateName) return;
    setLoadingSaved(true);
    setMessage("");
    setError("");
    try {
      const response = await axios.get(apiUrl("/survey-updates/submissions/latest"), {
        params: {
          topic_key: selectedTopicKey,
          state: stateName,
          year: surveyYear,
        },
      });
      if (response.data.answers && Object.keys(response.data.answers).length) {
        setAnswersByTopic((current) => ({
          ...current,
          [selectedTopicKey]: response.data.answers,
        }));
        setRespondentName(response.data.submission?.respondent_name || "");
        setMessage("Loaded saved answers from Supabase.");
      } else {
        setMessage("No saved answers found for this topic, state, and year.");
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not load saved survey update answers."
      );
    } finally {
      setLoadingSaved(false);
    }
  };

  const saveCurrentAnswers = async () => {
    if (!selectedTopicKey) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await axios.post(apiUrl("/survey-updates/submissions"), {
        topic_key: selectedTopicKey,
        topic_label: getTopicLabel(selectedTopicKey),
        state: stateName,
        survey_year: surveyYear,
        respondent_name: respondentName,
        answers: currentAnswers,
      });
      setMessage(`Saved ${response.data.answer_count || 0} answers to Supabase.`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not save survey update answers."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: "1360px" }}>
      <h1 className="dashboard-title">Survey-Based Updates</h1>

      <div
        className="card"
        style={{
          padding: "28px",
          borderRadius: "20px",
          marginBottom: "28px",
        }}
      >
        <div style={{ marginBottom: "18px" }}>
          <div
            style={{
              fontSize: "1.15rem",
              fontWeight: 700,
              color: "#1f2d3d",
              marginBottom: "8px",
            }}
          >
            ITS Topic
          </div>
          <div style={{ color: "#556476", lineHeight: 1.6 }}>
            Select a topic, then answer the questions below.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 2fr) repeat(3, minmax(150px, 1fr))",
            gap: "14px",
            alignItems: "end",
          }}
        >
          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Topic</div>
            <select
              value={selectedTopicKey}
              onChange={(event) => setSelectedTopicKey(event.target.value)}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: "14px",
                border: "1px solid #cfd8e3",
                fontSize: "1.18rem",
                fontWeight: 700,
                background: "#fff",
                boxSizing: "border-box",
              }}
            >
              <option value="">Select a scoring topic</option>
              {TOPIC_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Year</div>
            <select
              value={surveyYear}
              onChange={(event) => setSurveyYear(event.target.value)}
              style={commonSelectStyle()}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>State</div>
            <select
              value={stateName}
              onChange={(event) => setStateName(event.target.value)}
              style={commonSelectStyle()}
            >
              {STATE_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Respondent</div>
            <input
              value={respondentName}
              onChange={(event) => setRespondentName(event.target.value)}
              placeholder="Optional"
              style={commonSelectStyle()}
            />
          </label>
        </div>
      </div>

      {message && (
        <div className="card" style={{ padding: "16px", marginBottom: "18px", color: "#067647" }}>
          {message}
        </div>
      )}
      {error && (
        <div className="card" style={{ padding: "16px", marginBottom: "18px", color: "#b42318" }}>
          {error}
        </div>
      )}

      {selectedTopicKey && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.9fr)",
            gap: "24px",
            alignItems: "start",
          }}
        >
          <section className="card" style={{ padding: "28px", borderRadius: "20px" }}>
            <h2 style={{ marginTop: 0, marginBottom: "10px", color: "#1f2d3d" }}>
              {getTopicLabel(selectedTopicKey)} Questions
            </h2>
            <p style={{ marginTop: 0, marginBottom: "24px", color: "#5f6f82" }}>
              Fill in the information you have for this topic.
            </p>
            {topicPurposeText ? (
              <p
                style={{
                  marginTop: "-8px",
                  marginBottom: "24px",
                  color: "#607185",
                  lineHeight: 1.7,
                  maxWidth: "920px",
                }}
              >
                {topicPurposeText}
              </p>
            ) : null}

            <div style={{ display: "grid", gap: "20px" }}>
              {topicQuestions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "18px",
                    padding: "22px",
                    background: "#fbfcfe",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#0057ff",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      marginBottom: "8px",
                    }}
                  >
                    Question {index + 1}
                  </div>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "#1f2d3d",
                      marginBottom: "10px",
                      lineHeight: 1.5,
                    }}
                  >
                    {question.label}
                  </div>
                  <Field
                    question={question}
                    value={currentAnswers[question.id]}
                    onChange={handleAnswerChange}
                  />
                </div>
              ))}
            </div>
          </section>

          <aside className="card" style={{ padding: "28px", borderRadius: "20px" }}>
            <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>Saved Answers</h3>
            <div style={{ display: "grid", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveCurrentAnswers}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Answers to Supabase"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={loadSavedAnswers}
                disabled={loadingSaved}
              >
                {loadingSaved ? "Loading..." : "Load Latest Saved Answers"}
              </button>
            </div>

            <div
              style={{
                marginTop: "22px",
                padding: "18px",
                borderRadius: "16px",
                background: "rgba(0, 87, 255, 0.06)",
                border: "1px solid rgba(0, 87, 255, 0.14)",
              }}
            >
              <div style={{ fontWeight: 700, color: "#1f2d3d", marginBottom: "8px" }}>
                Current Scope
              </div>
              <div style={{ color: "#607185", lineHeight: 1.6, fontSize: "0.96rem" }}>
                Answers still save locally while you type. Use the save button
                when the answers should become available to backend scoring and
                expert review.
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
