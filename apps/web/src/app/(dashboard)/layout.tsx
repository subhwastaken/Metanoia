import React from "react";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-slate-100 antialiased flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#09090b] p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
