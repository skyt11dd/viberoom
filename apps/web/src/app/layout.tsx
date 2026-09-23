import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '../contexts/AuthContext';
import { SocketProvider } from '../contexts/SocketContext';
import { VoiceProvider } from '../contexts/VoiceContext';
import Script from 'next/script';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VIBEROOM - Дивись відео разом",
  description: "Дивіться відео разом із друзями в реальному часі у VIBEROOM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SocketProvider>
            <VoiceProvider>
              {children}
            </VoiceProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
