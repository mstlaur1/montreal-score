import type { PromiseStatus } from "@/lib/types";

const statusStyles: Record<PromiseStatus, string> = {
  not_started: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  broken: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  partially_met: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
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
