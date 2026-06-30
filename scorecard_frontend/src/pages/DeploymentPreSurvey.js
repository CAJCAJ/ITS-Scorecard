import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { apiUrl } from "../services/api";
import { getSessionState } from "../utils/auth";

const SURVEY_TYPE_OPTIONS = [
  { value: "AM", label: "Arterial Management" },
  { value: "FM", label: "Freeway Management" },
  { value: "TM", label: "Transit Management" },
];

function inputStyle() {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #d7dfea",
    fontSize: "0.98rem",
    boxSizing: "border-box",
    background: "#fff",
  };
}

function valueLabel(option) {
  return `${option.value} - ${option.label}`;
}

function FieldControl({ variable, format, options = [], value, onChange }) {
  const normalizedFormat = String(format || "").toLowerCase();

  if (normalizedFormat === "numeric") {
    return (
      <input
        type="number"
        value={value || ""}
        onChange={(event) => onChange(variable, event.target.value)}
        style={inputStyle()}
      />
    );
  }

  if (normalizedFormat === "text" || !options.length) {
    return (
      <textarea
        rows={2}
        value={value || ""}
        onChange={(event) => onChange(variable, event.target.value)}
        style={{ ...inputStyle(), minHeight: "72px", resize: "vertical" }}
      />
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(event) => onChange(variable, event.target.value)}
      style={inputStyle()}
    >
      <option value="">Select response</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {valueLabel(option)}
        </option>
      ))}
    </select>
  );
}

function QuestionCard({ question, index, answers, onAnswerChange }) {
  const hasSubQuestions = question.subQuestions?.length > 0;

  return (
    <section
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "18px",
        padding: "22px",
        background: "#fbfcfe",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          alignItems: "flex-start",
          marginBottom: "14px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.82rem",
              fontWeight: 800,
              color: "#0057ff",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              marginBottom: "8px",
            }}
          >
            Question {question.questionNumber || index + 1}
          </div>
          <h3
            style={{
              margin: 0,
              color: "#1f2d3d",
              lineHeight: 1.45,
              fontSize: "1.06rem",
            }}
          >
            {question.prompt}
          </h3>
        </div>
        <span
          style={{
            whiteSpace: "nowrap",
            color: "#607185",
            fontSize: "0.86rem",
            fontWeight: 700,
          }}
        >
          {hasSubQuestions
            ? `${question.subQuestions.length} fields`
            : question.variable}
        </span>
      </div>

      {hasSubQuestions ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {question.subQuestions.map((subQuestion) => (
            <div
              key={subQuestion.variable}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(260px, 1.2fr) minmax(220px, 0.8fr)",
                gap: "14px",
                alignItems: "center",
                padding: "12px",
                borderRadius: "12px",
                background: "#fff",
                border: "1px solid #e6edf5",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#1f2d3d" }}>
                  {subQuestion.label}
                </div>
                <div style={{ color: "#7a8797", fontSize: "0.84rem", marginTop: "4px" }}>
                  {subQuestion.variable}
                </div>
              </div>
              <FieldControl
                variable={subQuestion.variable}
                format={subQuestion.format}
                options={subQuestion.options}
                value={answers[subQuestion.variable]}
                onChange={onAnswerChange}
              />
            </div>
          ))}
        </div>
      ) : (
        <FieldControl
          variable={question.variable}
          format={question.format}
          options={question.options}
          value={answers[question.variable]}
          onChange={onAnswerChange}
        />
      )}
    </section>
  );
}

export default function DeploymentPreSurvey() {
  const [schema, setSchema] = useState(null);
  const [selectedSurveyType, setSelectedSurveyType] = useState("AM");
  const [surveyYear, setSurveyYear] = useState("2024");
  const [agencyName, setAgencyName] = useState("");
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const stateName = getSessionState() || "New Jersey";

  useEffect(() => {
    let cancelled = false;
    async function loadSchema() {
      setLoading(true);
      setError("");
      try {
        const response = await axios.get(apiUrl("/pre-survey/schema"), {
          params: { survey_type: selectedSurveyType },
        });
        if (!cancelled) {
          setSchema(response.data);
          setSurveyYear(response.data?.yearOptions?.[0] || "2024");
          setAnswers({});
          setMessage("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.response?.data?.error ||
              "Could not load the ITS Deployment Pre-Survey."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSchema();
    return () => {
      cancelled = true;
    };
  }, [selectedSurveyType]);

  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter(
        (value) => value !== undefined && value !== null && String(value).trim() !== ""
      ).length,
    [answers]
  );

  const handleAnswerChange = (variable, value) => {
    setMessage("");
    setError("");
    setAnswers((current) => ({
      ...current,
      [variable]: value,
    }));
  };

  const saveSurvey = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await axios.post(apiUrl("/pre-survey/submissions"), {
        survey_year: surveyYear,
        survey_type: selectedSurveyType,
        agency_name: agencyName,
        state: stateName,
        answers,
      });
      setMessage(
        `Saved ${response.data.csv_filename} to Supabase with ${
          response.data.variable_count || 0
        } survey variables.`
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not save the pre-survey. Confirm the Supabase schema has been updated."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: "1380px" }}>
      <h1 className="dashboard-title">ITS Deployment Pre-Survey</h1>

      <section className="card" style={{ padding: "28px", borderRadius: "20px", marginBottom: "24px" }}>
        <p style={{ color: "#607185", lineHeight: 1.7, marginTop: 0 }}>
          Complete a 2024 or 2025 pre-survey using the selected 2023 ITS deployment survey structure.
          The state is locked to the current login session.
        </p>

        <label
          style={{
            display: "block",
            marginBottom: "22px",
            padding: "18px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #e8f1ff, #f8fbff)",
            border: "2px solid #b8d4ff",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: "10px",
              fontSize: "1.08rem",
              color: "#0f3d77",
            }}
          >
            Select Pre-Survey Type
          </div>
          <select
            value={selectedSurveyType}
            onChange={(event) => setSelectedSurveyType(event.target.value)}
            style={{
              ...inputStyle(),
              minHeight: "58px",
              fontSize: "1.16rem",
              fontWeight: 850,
              border: "2px solid #2f80ed",
              color: "#102a43",
            }}
          >
            {(schema?.surveyTypeOptions || SURVEY_TYPE_OPTIONS).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.value})
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px minmax(260px, 1fr) 220px 220px",
            gap: "16px",
            alignItems: "end",
          }}
        >
          <label>
            <div style={{ fontWeight: 800, marginBottom: "8px" }}>Survey Year</div>
            <select
              value={surveyYear}
              onChange={(event) => setSurveyYear(event.target.value)}
              style={inputStyle()}
            >
              {(schema?.yearOptions || ["2024", "2025"]).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontWeight: 800, marginBottom: "8px" }}>Agency Name</div>
            <input
              value={agencyName}
              onChange={(event) => setAgencyName(event.target.value)}
              placeholder="Enter agency name"
              style={inputStyle()}
            />
          </label>
          <label>
            <div style={{ fontWeight: 800, marginBottom: "8px" }}>State</div>
            <input value={stateName} disabled style={{ ...inputStyle(), background: "#f3f6fa" }} />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveSurvey}
            disabled={saving || loading || !agencyName.trim()}
            style={{ minHeight: "48px" }}
          >
            {saving ? "Saving..." : "Save CSV to Supabase"}
          </button>
        </div>
      </section>

      {message ? (
        <div className="card" style={{ padding: "16px", marginBottom: "18px", color: "#067647" }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="card" style={{ padding: "16px", marginBottom: "18px", color: "#b42318" }}>
          {error}
        </div>
      ) : null}

      <section className="card" style={{ padding: "24px", borderRadius: "20px", marginBottom: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
            gap: "16px",
          }}
        >
          <div><strong>Survey Type</strong><br />{schema?.surveyTypeLabel || "Arterial Management"}</div>
          <div><strong>Source</strong><br />{schema?.sourceWorkbook || "2023_AM_State_data.xlsx"}</div>
          <div><strong>Main Questions</strong><br />{schema?.questions?.length || 0}</div>
          <div><strong>Survey Variables</strong><br />{schema?.variables?.length || 0}</div>
          <div><strong>Answered Fields</strong><br />{answeredCount}</div>
        </div>
      </section>

      {loading ? (
        <div className="card" style={{ padding: "24px" }}>Loading pre-survey...</div>
      ) : null}

      {schema?.questions?.length ? (
        <div style={{ display: "grid", gap: "18px" }}>
          {schema.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              answers={answers}
              onAnswerChange={handleAnswerChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
