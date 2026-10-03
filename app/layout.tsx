import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaterInBangkok — แผนที่เสี่ยงน้ำท่วม กทม. และปริมณฑล",
  description:
    "แผนที่ประเมินความเสี่ยงน้ำท่วมรายเขต/อำเภอ กรุงเทพฯ นนทบุรี ปทุมธานี สมุทรปราการ สมุทรสาคร นครปฐม จากข้อมูลฝน ระดับน้ำ และน้ำท่าแบบเรียลไทม์",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5394",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
