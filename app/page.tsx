import SearchInterface from "@/components/SearchInterface";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-meriton-charcoal">
      {/* Meriton-style Header - Sticky */}
      <header className="sticky top-0 z-50 bg-white dark:bg-meriton-charcoal border-b border-meriton-light dark:border-meriton-dark shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/meriton-logo.jpg"
                alt="Meriton"
                width={120}
                height={40}
                className="object-contain"
                priority
              />
              <span className="text-meriton-silver text-sm font-light hidden sm:inline">|</span>
              <span className="text-meriton-charcoal dark:text-meriton-silver text-sm font-medium hidden sm:inline">
                Archive Search
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* SearchInterface handles its own layout for sticky positioning */}
      <SearchInterface />
    </main>
  );
}
