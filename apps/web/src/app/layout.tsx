import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[#12141f] text-white`}
    >
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (window.Telegram && window.Telegram.WebApp) {
                  const tg = window.Telegram.WebApp;
                  tg.ready();
                  tg.expand();
                  if (typeof tg.requestFullscreen === 'function') {
                    tg.requestFullscreen();
                  }
                  if (typeof tg.disableVerticalSwipes === 'function') {
                    tg.disableVerticalSwipes();
                  }
                  tg.setHeaderColor('#12141f');
                  tg.setBackgroundColor('#12141f');

                  // Secondary attempts to guarantee edge-to-edge fullscreen
                  setTimeout(() => {
                    try {
                      if (typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
                        tg.requestFullscreen();
                      }
                    } catch(e) {}
                  }, 150);

                  const triggerFullscreenOnGesture = () => {
                    try {
                      if (typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
                        tg.requestFullscreen();
                      }
                    } catch(e) {}
                  };
                  window.addEventListener('click', triggerFullscreenOnGesture, { once: true, passive: true });
                  window.addEventListener('touchstart', triggerFullscreenOnGesture, { once: true, passive: true });
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#12141f] text-white">
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
