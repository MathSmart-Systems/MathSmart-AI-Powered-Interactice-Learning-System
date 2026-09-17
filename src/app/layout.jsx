import { Fraunces, IBM_Plex_Sans } from "next/font/google";

import { GlobalThemeListener } from "@/modules/shared";

import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const metadata = {
  title: "MathSmart | AI-Powered Interactive Learning System",
  description:
    "AI-Powered Interactive Mathematics Learning System for Elementary Learners",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var prefs = localStorage.getItem('mathsmart.teacher_preferences');
                  var theme = prefs ? JSON.parse(prefs).theme : null;
                  if (!theme) {
                    theme = localStorage.getItem('mathsmart_theme') || 'system';
                  }
                  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <GlobalThemeListener />
        {children}
      </body>
    </html>
  );
}
