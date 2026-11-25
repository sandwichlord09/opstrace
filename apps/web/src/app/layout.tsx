import type React from 'react';
import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpsTrace - Discrepancy & Evidence Management',
  description: 'Connect physical operations with digital records',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
