import Script from "next/script";
import Link from "next/link";

export const metadata = { title: "모임노트" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-TEST000000" strategy="afterInteractive" />
        <Script id="ga" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-TEST000000');`}
        </Script>
      </head>
      <body>
        {children}
        <footer>
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/terms">이용약관</Link>
          <p>문의: help@moimnote.example</p>
        </footer>
      </body>
    </html>
  );
}
