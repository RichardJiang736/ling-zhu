import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const runtime = 'edge'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "聆竹 - 听声辨人 · 气若幽兰",
  description: "聆竹是一个优雅的音频说话人分离与识别应用，运用人工智能技术辨识不同说话人，如墨染竹简，气若幽兰。",
  keywords: ["聆竹", "音频分离", "说话人识别", "语音识别", "AI", "人工智能", "音频处理"],
  authors: [{ name: "聆竹团队" }],
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: "聆竹 - 听声辨人",
    description: "优雅的音频说话人分离与识别应用",
    siteName: "聆竹",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "聆竹 - 听声辨人",
    description: "优雅的音频说话人分离与识别应用",
  },
};

export const viewport: Viewport = {
  themeColor: "#276b4d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
