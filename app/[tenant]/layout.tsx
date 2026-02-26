import { TenantProvider } from "@/components/providers/TenantProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { LanguageProvider } from "@/lib/i18n";
import { TenantSidebar } from "@/components/dashboard/TenantSidebar";

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <TenantProvider>
          <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
            <TenantSidebar />
            <main className="flex-1 p-4 pt-16 lg:pt-8 lg:p-8 lg:ml-64 overflow-auto">
              {children}
            </main>
          </div>
        </TenantProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
