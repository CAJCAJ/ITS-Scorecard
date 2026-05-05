# Survey Question Schema

This project now treats survey question IDs as a stable internal contract.

## Principles

- Topic identity is based on a stable `topic_key`, not the visible topic label.
- Question identity is based on a stable `question_id`, not the question text.
- UI labels can change without changing storage shape.
- Database rows should store `topic_key` and `question_id`.
- Scoring code should read `question_id` constants from a registry, not hardcoded strings scattered across files.

## Current Schema Version

- `1`

## Stable Topic Keys

- `benefit_cost`
- `deployment_coverage`
- `policy_legislation`
- `project_planning`
- `facility`

## Storage Direction

When Survey-Based Updates is moved to Supabase, use this shape:

- `survey_update_submissions`
  - `id`
  - `schema_version`
  - `topic_key`
  - `state`
  - `survey_year`
  - `agency_name`
  - `status`
  - `created_at`
  - `updated_at`

- `survey_update_answers`
  - `id`
  - `submission_id`
  - `question_id`
  - `answer_text`
  - `answer_number`
  - `answer_json`
  - `created_at`
  - `updated_at`

## Change Rules

- Add a question: add a new `question_id`.
- Remove a question: stop using that `question_id`; keep old rows for history.
- Rename question text: keep the same `question_id`.
- Change scoring logic: update the scorer, not the database schema.
- Change a `question_id` only if you intentionally want a new semantic field.
