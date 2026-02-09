import type { PromiseStatus } from "@/lib/types";

const statusStyles: Record<PromiseStatus, string> = {
  not_started: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-300 text-green-950 dark:bg-green-800 dark:text-green-100",
  broken: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  partially_met: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
};

interface StatusBadgeProps {
  status: PromiseStatus;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`${statusStyles[status]} text-xs font-medium px-2 py-0.5 rounded-full`}>
      {label}
    </span>
  );
}
