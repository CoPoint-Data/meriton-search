import SearchInterface from "@/components/SearchInterface";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Meriton Search
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Search historical transaction data from QuickBooks archives
          </p>
        </header>

        <SearchInterface />
      </div>
    </main>
  );
}
