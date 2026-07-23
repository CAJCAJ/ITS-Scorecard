import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import "./FeedbackBlockAnnotator.css";

const GENERIC_CLASS_NAMES = new Set([
  "card",
  "content",
  "container",
  "grid",
  "panel",
  "section",
]);

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function humanizeClassName(element) {
  const className = Array.from(element.classList).find((name) => {
    if (GENERIC_CLASS_NAMES.has(name)) return false;
    return /(?:^|-)(?:card|panel|section)$/.test(name);
  });
  return normalizeText(className?.replace(/[-_]+/g, " "));
}

function isBlockElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.matches("[data-feedback-block], section, article, .card")) return true;
  return Array.from(element.classList).some((name) =>
    /(?:^|-)(?:card|panel|section)$/.test(name)
  );
}

function blockLabel(element, index) {
  const explicitLabel =
    element.getAttribute("data-feedback-label") ||
    element.getAttribute("aria-label");
  const heading = element.querySelector("h1, h2, h3, h4, h5, h6");
  return (
    normalizeText(explicitLabel) ||
    normalizeText(heading?.textContent) ||
    humanizeClassName(element) ||
    `Section ${index + 1}`
  ).slice(0, 180);
}

function blockIdentifier(label, index) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "section"}-${index + 1}`;
}

export default function FeedbackBlockAnnotator() {
  const location = useLocation();

  useEffect(() => {
    const root = document.querySelector(".content");
    if (!root) return undefined;

    let animationFrame = null;

    const annotateBlocks = () => {
      animationFrame = null;
      const candidates = Array.from(
        root.querySelectorAll(
          "section, article, div[class], [data-feedback-block]"
        )
      ).filter(
        (element) =>
          isBlockElement(element) &&
          !element.closest(".floating-feedback, .feedback-profile-page")
      );

      candidates.forEach((element, index) => {
        const label = blockLabel(element, index);
        const identifier =
          element.getAttribute("data-feedback-block") ||
          element.id ||
          element.getAttribute("data-feedback-block-id") ||
          blockIdentifier(label, index);
        const existingButton = element.querySelector(
          ":scope > .feedback-block-pencil"
        );
        if (existingButton) {
          existingButton.dataset.sectionBlock = label;
          existingButton.dataset.sectionId = identifier;
          existingButton.title = `Comment on: ${label}`;
          existingButton.setAttribute("aria-label", `Comment on ${label}`);
          return;
        }
        const button = document.createElement("button");

        button.type = "button";
        button.className = "feedback-block-pencil";
        button.textContent = "✎";
        button.dataset.sectionBlock = label;
        button.dataset.sectionId = identifier;
        button.title = `Comment on: ${label}`;
        button.setAttribute("aria-label", `Comment on ${label}`);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(
            new CustomEvent("its:open-feedback", {
              detail: {
                sectionBlock: button.dataset.sectionBlock,
                sectionId: button.dataset.sectionId,
                pagePath: `${location.pathname}${location.search}`,
              },
            })
          );
        });

        element.classList.add("feedback-block-target");
        element.setAttribute("data-feedback-annotated", "true");
        element.setAttribute("data-feedback-block-id", identifier);
        element.appendChild(button);
      });
    };

    const scheduleAnnotation = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(annotateBlocks);
    };

    annotateBlocks();
    const observer = new MutationObserver(scheduleAnnotation);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      root
        .querySelectorAll("[data-feedback-annotated='true']")
        .forEach((element) => {
          element.querySelector(":scope > .feedback-block-pencil")?.remove();
          element.classList.remove("feedback-block-target");
          element.removeAttribute("data-feedback-annotated");
          element.removeAttribute("data-feedback-block-id");
        });
    };
  }, [location.pathname, location.search]);

  return null;
}
