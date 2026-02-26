"use client";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <Sidebar />
        {/* Main content area - offset by sidebar width */}
        <main className="ml-64 transition-all duration-300">
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
