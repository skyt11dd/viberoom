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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[#090a10] text-white`}
    >
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (window.Telegram && window.Telegram.WebApp) {
                  window.Telegram.WebApp.ready();
                  window.Telegram.WebApp.expand();
                  window.Telegram.WebApp.setHeaderColor('#090a10');
                  window.Telegram.WebApp.setBackgroundColor('#090a10');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#090a10] text-white">
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
