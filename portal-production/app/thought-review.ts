export type ThoughtReview = {
  source_thought: string;
  supporting_context: string;
  missing_context: string;
  alternative_view: string;
  current_view: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ThoughtReviewDraft = Pick<
  ThoughtReview,
  | "source_thought"
  | "supporting_context"
  | "missing_context"
  | "alternative_view"
  | "current_view"
>;
