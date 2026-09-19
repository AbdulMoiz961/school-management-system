/**
 * Grade scale shared by the report card and any UI that shows a grade.
 * Kept in one place so the API and client can never disagree.
 */
export const GRADE_SCALE: { min: number; grade: string }[] = [
  { min: 90, grade: "A+" },
  { min: 80, grade: "A" },
  { min: 70, grade: "B" },
  { min: 60, grade: "C" },
  { min: 50, grade: "D" },
  { min: 40, grade: "E" },
  { min: 0, grade: "F" },
];

/** Percentage → letter grade. */
export function gradeFor(percentage: number): string {
  return GRADE_SCALE.find((g) => percentage >= g.min)?.grade ?? "F";
}

/** Rounds to one decimal place, the precision the UI shows. */
export function pct(obtained: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((obtained / max) * 1000) / 10;
}
