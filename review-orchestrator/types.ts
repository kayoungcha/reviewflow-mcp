export interface ReviewResult {
  reviewer: string;
  jiraSummary: string | null;
  positives: string[];
  issues: string[];
  summary: string;
}
