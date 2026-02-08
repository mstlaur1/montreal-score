import type { Grade } from "@/lib/types";
import { gradeBgClass } from "@/lib/scoring";

interface GradeBadgeProps {
  grade: Grade;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-8 h-8 text-sm",
  md: "w-12 h-12 text-xl",
  lg: "w-20 h-20 text-4xl",
};

export function GradeBadge({ grade, size = "md" }: GradeBadgeProps) {
  return (
    <div
      className={`${gradeBgClass(grade)} ${sizeClasses[size]} rounded-lg flex items-center justify-center font-bold text-white`}
    >
      {grade}
    </div>
  );
}
