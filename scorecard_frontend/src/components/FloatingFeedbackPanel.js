import React, { useState } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { FaCommentDots, FaTimes } from "react-icons/fa";

import { apiUrl } from "../services/api";
import { getSessionState, getUsername } from "../utils/auth";
import "./FloatingFeedbackPanel.css";

export default function FloatingFeedbackPanel() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetStatusSoon = () => {
    window.setTimeout(() => {
      setStatus({ type: "", message: "" });
    }, 3500);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedComment = comment.trim();

    if (!trimmedComment) {
      setStatus({ type: "error", message: "Please enter a comment first." });
      resetStatusSoon();
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    try {
      await axios.post(apiUrl("/feedback"), {
        comment: trimmedComment,
        page_path: `${location.pathname}${location.search}`,
        user_name: getUsername(),
        state: getSessionState(),
      });

      setComment("");
      setStatus({ type: "success", message: "Feedback saved." });
      resetStatusSoon();
    } catch (error) {
      const message =
        error.response?.data?.error ||
        "Could not save feedback. Please try again later.";
      setStatus({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`floating-feedback${isOpen ? " open" : ""}`}>
      {!isOpen ? (
        <button
          type="button"
          className="floating-feedback-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Open feedback panel"
        >
          <FaCommentDots />
          <span>Feedback</span>
        </button>
      ) : (
        <section className="floating-feedback-panel" aria-label="Feedback panel">
          <div className="floating-feedback-header">
            <div>
              <h3>Feedback</h3>
              <p>Share comments about this page.</p>
            </div>
            <button
              type="button"
              className="floating-feedback-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close feedback panel"
            >
              <FaTimes />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Type your thoughts, issues, or suggestions..."
              maxLength={2000}
              rows={5}
            />
            <div className="floating-feedback-footer">
              <span>{comment.length}/2000</span>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Submit"}
              </button>
            </div>
          </form>

          {status.message && (
            <div className={`floating-feedback-status ${status.type}`}>
              {status.message}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
