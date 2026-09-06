import "./globals.css";

export const metadata = {
  title: "MathSmart | AI-Powered Interactive Learning System",
  description: "AI-Powered Interactive Mathematics Learning System for Elementary Learners",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
        {children}
      </body>
    </html>
  );
}
