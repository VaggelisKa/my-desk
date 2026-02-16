import { getUserFriendlyErrorMessage } from "~/lib/error-messages";

export function ErrorCard({ message }: { message?: unknown }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/10 px-4">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-900">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-red-500 p-2 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium">An error has occurred</h2>
              <p className="text-gray-500 dark:text-gray-400">
                {getUserFriendlyErrorMessage(message)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
