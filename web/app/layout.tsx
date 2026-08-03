import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "./sidebar";
import RootBackground from "./root-background";

const display = localFont({
  variable: "--font-bricolage",
  display: "swap",
  src: "../assets/fonts/BeVietnamPro-ExtraBold.ttf",
});
const body = localFont({
  variable: "--font-bevietnam",
  display: "swap",
  src: [
    { path: "../assets/fonts/BeVietnamPro-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/BeVietnamPro-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../assets/fonts/BeVietnamPro-ExtraBold.ttf", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Contentta — Content Agent",
  description: "Tạo, đăng và quản lý nội dung Contentta",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-screen">
        <RootBackground />
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 px-6 py-6 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
