import type { Metadata } from "next";
import { Bricolage_Grotesque, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import Sidebar from "./sidebar";
import RootBackground from "./root-background";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});
const body = Be_Vietnam_Pro({
  variable: "--font-bevietnam",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
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
