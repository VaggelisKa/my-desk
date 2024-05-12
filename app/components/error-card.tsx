export function ErrorCard({ message }: { message?: any }) {
  return (
    <div className="fixed bg-gray-900/10   inset-0 flex items-center justify-center z-50 px-4">
      <div className="w-full h-full flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg max-w-md w-full">
          <div className="flex items-center gap-4">
            <div className="bg-red-500 text-white rounded-full p-2">
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
              <h2 className="text-lg font-medium">An error has ocurred!</h2>
              <p className="text-gray-500 dark:text-gray-400">
                {message || "Something went wrong. Please try again later."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
