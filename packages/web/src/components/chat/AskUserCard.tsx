import { useState, useCallback } from "react";
import { MessageCircleQuestion, Check, Circle, Square, CheckSquare, ChevronRight } from "lucide-react";
import type { AskUserQuestion, AskUserAnswer } from "../../types";

interface AskUserCardProps {
  requestId: string;
  questions: AskUserQuestion[];
  onSubmit: (requestId: string, answers: AskUserAnswer[]) => void;
}

export function AskUserCard({ requestId, questions, onSubmit }: AskUserCardProps) {
  const [step, setStep] = useState(0);
  // Per-question selection state: Map<questionIndex, Set<selectedLabels>>
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() => new Map());
  // Per-question "Other" text
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() => new Map());
  const [submitted, setSubmitted] = useState(false);

  const toggleOption = useCallback((qi: number, label: string, multiSelect?: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(prev.get(qi) ?? []);

      if (multiSelect) {
        if (current.has(label)) {
          current.delete(label);
        } else {
          current.add(label);
        }
      } else {
        // Single-select: replace
        current.clear();
        current.add(label);
      }

      next.set(qi, current);
      return next;
    });
  }, []);

  const toggleOther = useCallback((qi: number, multiSelect?: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(prev.get(qi) ?? []);

      if (current.has("__other__")) {
        current.delete("__other__");
      } else {
        if (!multiSelect) current.clear();
        current.add("__other__");
      }

      next.set(qi, current);
      return next;
    });
  }, []);

  const setOtherText = useCallback((qi: number, text: string) => {
    setOtherTexts((prev) => {
      const next = new Map(prev);
      next.set(qi, text);
      return next;
    });
  }, []);

  const isStepAnswered = (qi: number) => {
    const sel = selections.get(qi);
    if (!sel || sel.size === 0) return false;
    if (sel.has("__other__") && !(otherTexts.get(qi)?.trim())) return false;
    return true;
  };

  const currentAnswered = isStepAnswered(step);
  const isLastStep = step === questions.length - 1;

  const handleNext = () => {
    if (!currentAnswered || isLastStep) return;
    setStep((s) => s + 1);
  };

  const handleSubmit = () => {
    if (!currentAnswered || submitted) return;
    setSubmitted(true);

    const answers: AskUserAnswer[] = questions.map((q, qi) => {
      const sel = selections.get(qi) ?? new Set();
      const selected: string[] = [];
      for (const label of sel) {
        if (label === "__other__") {
          selected.push(otherTexts.get(qi)?.trim() || "Other");
        } else {
          selected.push(label);
        }
      }
      return { question: q.question, selected };
    });

    onSubmit(requestId, answers);
  };

  const q = questions[step];
  const sel = selections.get(step) ?? new Set();
  const allowOther = q.allowOther !== false; // default true

  return (
    <div className="flex justify-start animate-fade-in-up">
      <div className="w-full max-w-xl rounded-lg border border-border/50 border-l-2 border-l-primary/50 bg-background-secondary/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
          <MessageCircleQuestion className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">The agent needs your input</span>
          {questions.length > 1 && !submitted && (
            <span className="ml-auto text-foreground-tertiary text-[10px]">
              {step + 1} / {questions.length}
            </span>
          )}
          {submitted && (
            <span className="ml-auto flex items-center gap-1 text-success text-[10px]">
              <Check className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>

        {/* Current question */}
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          <p className="text-sm text-foreground">{q.question}</p>

          {/* Options */}
          <div className="space-y-1">
            {q.options.map((opt) => {
              const isSelected = sel.has(opt.label);
              const Indicator = q.multiSelect
                ? (isSelected ? CheckSquare : Square)
                : (isSelected ? Check : Circle);

              return (
                <button
                  key={opt.label}
                  disabled={submitted}
                  onClick={() => toggleOption(step, opt.label, q.multiSelect)}
                  className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-background/40 border border-border/30 hover:bg-surface-glass-hover"
                  } ${submitted ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                >
                  <Indicator className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-foreground-tertiary"}`} />
                  <div>
                    <span className={`font-medium ${isSelected ? "text-foreground" : "text-foreground-secondary"}`}>
                      {opt.label}
                    </span>
                    {opt.description && (
                      <p className="text-foreground-tertiary mt-0.5">{opt.description}</p>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Other option */}
            {allowOther && (
              <div>
                <button
                  disabled={submitted}
                  onClick={() => toggleOther(step, q.multiSelect)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors ${
                    sel.has("__other__")
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-background/40 border border-border/30 hover:bg-surface-glass-hover"
                  } ${submitted ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                >
                  {q.multiSelect
                    ? (sel.has("__other__") ? <CheckSquare className="w-3.5 h-3.5 shrink-0 text-primary" /> : <Square className="w-3.5 h-3.5 shrink-0 text-foreground-tertiary" />)
                    : (sel.has("__other__") ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" /> : <Circle className="w-3.5 h-3.5 shrink-0 text-foreground-tertiary" />)
                  }
                  <span className={`font-medium ${sel.has("__other__") ? "text-foreground" : "text-foreground-secondary"}`}>
                    Other
                  </span>
                </button>
                {sel.has("__other__") && (
                  <input
                    type="text"
                    autoFocus
                    disabled={submitted}
                    placeholder="Type your answer..."
                    value={otherTexts.get(step) ?? ""}
                    onChange={(e) => setOtherText(step, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && currentAnswered) {
                        isLastStep ? handleSubmit() : handleNext();
                      }
                    }}
                    className="mt-1 w-full px-3 py-1.5 rounded-md text-xs bg-background border border-border/50 text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Next / Submit */}
        {!submitted && (
          <div className="border-t border-border/30 px-3 py-2 flex justify-end">
            {isLastStep ? (
              <button
                disabled={!currentAnswered}
                onClick={handleSubmit}
                className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit
              </button>
            ) : (
              <button
                disabled={!currentAnswered}
                onClick={handleNext}
                className="flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
