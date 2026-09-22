"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { ToastContainer } from "@/components/ui/toast";
import { QuickAddModal } from "@/components/modals/quick-add-modal";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onQuickAdd={() => setQuickAddOpen(true)} />

        <main className="flex-1 px-4 sm:px-6 py-5 pb-20 lg:pb-5">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav onQuickAdd={() => setQuickAddOpen(true)} />

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
