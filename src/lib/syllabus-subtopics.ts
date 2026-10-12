/** Topics may be leaf (0 subtopics) or split (≥2). Exactly one subtopic is invalid. */
export function assertSubtopicCountValid(count: number, context = "This topic") {
  if (count === 1) {
    throw new Error(`${context} must have either no subtopics or at least two — not one.`);
  }
}

export function wouldLeaveSingleSubtopic(currentCount: number, removing: number): boolean {
  return currentCount - removing === 1;
}
